import { DomainError } from './domain.ts';
import type { MessageKey } from './i18n/index.ts';

export const MAX_QUERY_CODEPOINTS = 256;
export const MAX_SEARCH_UNITS = 20;
export const MAX_SEARCH_OPERATORS = 40;
export const MAX_SEARCH_DEPTH = 8;
export const normalizeSearch = (value: string): string =>
  value.normalize('NFKC').toLowerCase();

/** A parsed search. `term` is a normalized substring that may match any field;
 * `tag` is an exact normalized tag key. Nothing else is ever matched, and no
 * user text is ever sent to SQL/FTS as syntax. */
export type SearchNode =
  | { type: 'term'; value: string }
  | { type: 'tag'; value: string }
  | { type: 'not'; node: SearchNode }
  | { type: 'and'; nodes: SearchNode[] }
  | { type: 'or'; nodes: SearchNode[] };
/** `null` means "no search" (blank query). */
export type SearchQuery = SearchNode | null;

type Token =
  | { k: '(' | ')' }
  | { k: 'op'; op: 'AND' | 'OR' | 'NOT' }
  | { k: 'term' | 'tag'; value: string };

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/u.test(ch);
const isOpen = (ch: string | undefined) => ch === '(' || ch === '（';
const isClose = (ch: string | undefined) => ch === ')' || ch === '）';
const fail = (key: MessageKey) => new DomainError('validation', key);

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let i = 0,
    codepoints = 0,
    units = 0,
    operators = 0;
  /** Reads a double-quoted unit starting after the opening quote. Quote and
   * backslash are the only escapes (unknown escapes keep the backslash). */
  const quoted = (): string => {
    let value = '';
    for (;;) {
      if (i >= query.length) throw fail('err.closeTheDoubleQuoteTo');
      const ch = query[i++];
      if (ch === '\\' && ['"', '\\'].includes(query[i])) value += query[i++];
      else if (ch === '"') break;
      else value += ch;
    }
    // A closing quote ends a whole unit; it never silently concatenates.
    if (i < query.length && !isSpace(query[i]) && !isClose(query[i]))
      throw fail('err.separateSearchTermsWithSpaces');
    return value;
  };
  const unit = (k: 'term' | 'tag', raw: string) => {
    const value = normalizeSearch(k === 'tag' ? raw.replace(/^#/, '') : raw);
    if (!value.length)
      throw fail(
        k === 'tag' ? 'err.searchTagNeedsAName' : 'err.anExactPhraseCannotBe',
      );
    codepoints += [...value].length;
    if (codepoints > MAX_QUERY_CODEPOINTS)
      throw fail('err.normalizedSearchIsLimitedTo');
    if (++units > MAX_SEARCH_UNITS) throw fail('err.useAtMost20Search');
    tokens.push({ k, value });
  };
  while (i < query.length) {
    const first = query[i];
    if (isSpace(first)) {
      i++;
    } else if (isOpen(first) || isClose(first)) {
      tokens.push({ k: isOpen(first) ? '(' : ')' });
      i++;
    } else if (first === '"') {
      i++;
      unit('term', quoted());
    } else {
      let word = '';
      let tagged = false;
      while (i < query.length && !isSpace(query[i])) {
        const ch = query[i];
        if (isOpen(ch) || isClose(ch)) break;
        i++;
        if (ch === '\\' && ['"', '\\'].includes(query[i])) word += query[i++];
        else if (ch === '"') {
          // Only `tag:"name"` may continue a word with a quote.
          if (!/^tag:$/i.test(word)) throw fail('err.putAPhraseInSeparate');
          unit('tag', quoted());
          tagged = true;
          break;
        } else word += ch;
      }
      if (tagged) continue;
      if (word === 'AND' || word === 'OR' || word === 'NOT') {
        if (++operators > MAX_SEARCH_OPERATORS)
          throw fail('err.searchHasTooManyOperators');
        tokens.push({ k: 'op', op: word });
      } else if (/^tag:/i.test(word)) unit('tag', word.slice(4));
      else unit('term', word);
    }
  }
  return tokens;
}

const rank = (n: SearchNode) =>
  ({ term: 0, tag: 1, not: 2, and: 3, or: 4 })[n.type];
const escape = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
type Context = 'top' | 'and' | 'or' | 'not';
function serialize(n: SearchNode, parent: Context): string {
  switch (n.type) {
    case 'term':
      return escape(n.value);
    case 'tag':
      return `tag:${escape(n.value)}`;
    case 'not':
      return `NOT ${serialize(n.node, 'not')}`;
    case 'and': {
      const text = n.nodes.map((c) => serialize(c, 'and')).join(' ');
      return parent === 'not' ? `(${text})` : text;
    }
    case 'or': {
      const text = n.nodes.map((c) => serialize(c, 'or')).join(' OR ');
      return parent === 'and' || parent === 'not' ? `(${text})` : text;
    }
  }
}
const sortKey = (n: SearchNode) =>
  n.type === 'term' || n.type === 'tag' ? n.value : serialize(n, 'top');
function compare(a: SearchNode, b: SearchNode): number {
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const x = sortKey(a),
    y = sortKey(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
/** Canonical form: flattened, deduplicated, binary-sorted, no double negation.
 * Independent of operand order and redundant grouping. */
function normalizeNode(n: SearchNode): SearchNode {
  if (n.type === 'term' || n.type === 'tag') return n;
  if (n.type === 'not') {
    const child = normalizeNode(n.node);
    return child.type === 'not' ? child.node : { type: 'not', node: child };
  }
  const flat: SearchNode[] = [];
  for (const child of n.nodes.map(normalizeNode))
    if (child.type === n.type) flat.push(...child.nodes);
    else flat.push(child);
  const seen = new Set<string>();
  const nodes = flat
    .filter((c) => {
      const key = serialize(c, 'top');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compare);
  return nodes.length === 1 ? nodes[0] : { type: n.type, nodes };
}

/** Grammar (ARCHITECTURE §8): quoted phrases and whitespace-separated words are
 * literal terms. Uppercase `AND`/`OR`/`NOT` and parentheses are structural only
 * when unquoted. Adjacent operands mean AND; precedence is NOT > AND > OR;
 * `tag:name` matches an exact tag. Quote anything that must stay literal. */
export function parseSearch(query: string): SearchQuery {
  if (query.includes('\0'))
    throw new DomainError('validation', 'err.searchCannotContainANul');
  // Grammar escaping/canonical quotes may expand transport but not content.
  if ([...query].length > 1024)
    throw new DomainError('validation', 'err.searchInputIsTooLong');
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  let pos = 0,
    depth = 0,
    parens = 0;
  const enter = () => {
    if (++depth > MAX_SEARCH_DEPTH) throw fail('err.searchIsNestedTooDeeply');
  };
  const startsOperand = (t: Token | undefined) =>
    !!t &&
    (t.k === 'term' ||
      t.k === 'tag' ||
      t.k === '(' ||
      (t.k === 'op' && t.op === 'NOT'));
  const group = (type: 'and' | 'or', nodes: SearchNode[]): SearchNode =>
    nodes.length === 1 ? nodes[0] : { type, nodes };
  const primary = (): SearchNode => {
    const t = tokens[pos++];
    if (!t || t.k === 'op') throw fail('err.searchOperatorNeedsOperand');
    if (t.k === ')')
      throw fail(
        parens
          ? 'err.searchOperatorNeedsOperand'
          : 'err.searchUnbalancedParentheses',
      );
    if (t.k === '(') {
      if (tokens[pos]?.k === ')') throw fail('err.searchEmptyGroup');
      enter();
      parens++;
      const inner = or();
      if (tokens[pos]?.k !== ')') throw fail('err.searchUnbalancedParentheses');
      pos++;
      parens--;
      depth--;
      return inner;
    }
    const leaf = t as Extract<Token, { value: string }>;
    return { type: leaf.k, value: leaf.value };
  };
  const not = (): SearchNode => {
    const t = tokens[pos];
    if (t?.k === 'op' && t.op === 'NOT') {
      pos++;
      enter();
      const node = not();
      depth--;
      return { type: 'not', node };
    }
    return primary();
  };
  const and = (): SearchNode => {
    const nodes = [not()];
    for (;;) {
      const t = tokens[pos];
      if (t?.k === 'op' && t.op === 'AND') {
        pos++;
        nodes.push(not());
      } else if (startsOperand(t)) nodes.push(not());
      else break;
    }
    return group('and', nodes);
  };
  function or(): SearchNode {
    const nodes = [and()];
    for (;;) {
      const t = tokens[pos];
      if (t?.k === 'op' && t.op === 'OR') {
        pos++;
        nodes.push(and());
      } else break;
    }
    return group('or', nodes);
  }
  const result = or();
  if (pos < tokens.length) throw fail('err.searchUnbalancedParentheses');
  return normalizeNode(result);
}
export function canonicalSearch(query: string): string {
  // Round-trippable canonical form; a plain AND of terms stays `"a" "b"`.
  const search = parseSearch(query);
  return search ? serialize(search, 'top') : '';
}
/** The literal oracle. `fields` are every searchable field (body, tags, file
 * names), each matched separately; `tags` are the note's exact tag keys. */
export function matchesSearch(
  fields: readonly string[],
  search: SearchQuery,
  tags: readonly string[] = [],
): boolean {
  if (!search) return true;
  const normalized = fields.map(normalizeSearch);
  const keys = tags.map(normalizeSearch);
  const evaluate = (n: SearchNode): boolean => {
    switch (n.type) {
      case 'term':
        return normalized.some((field) => field.includes(n.value));
      case 'tag':
        return keys.includes(n.value);
      case 'not':
        return !evaluate(n.node);
      case 'and':
        return n.nodes.every(evaluate);
      case 'or':
        return n.nodes.some(evaluate);
    }
  };
  return evaluate(search);
}
/** Terms/tags that must be present for a match (an even number of NOTs above
 * them): the only ones worth highlighting. */
export function positiveSearch(search: SearchQuery): {
  terms: string[];
  tags: string[];
} {
  const terms = new Set<string>(),
    tags = new Set<string>();
  const walk = (n: SearchNode, negated: boolean) => {
    if (n.type === 'term' && !negated) terms.add(n.value);
    else if (n.type === 'tag' && !negated) tags.add(n.value);
    else if (n.type === 'not') walk(n.node, !negated);
    else if (n.type === 'and' || n.type === 'or')
      for (const c of n.nodes) walk(c, negated);
  };
  if (search) walk(search, false);
  return { terms: [...terms], tags: [...tags] };
}
/** Same query with each term/tag value rewritten (used by tag-name search). */
export function mapSearchValues(
  search: SearchQuery,
  map: (value: string) => string,
): SearchQuery {
  const walk = (n: SearchNode): SearchNode =>
    n.type === 'term' || n.type === 'tag'
      ? { type: n.type, value: map(n.value) }
      : n.type === 'not'
        ? { type: 'not', node: walk(n.node) }
        : { type: n.type, nodes: n.nodes.map(walk) };
  return search ? walk(search) : null;
}
export interface SearchSegment {
  text: string;
  highlighted: boolean;
}
export interface SearchSnippet {
  field: 'body' | 'tag' | 'filename';
  segments: SearchSegment[];
}
/** Safe, explicitly normalized text; never offsets into the original source.
 * UTF-16 indices are used only within the same normalized string. */
export function searchSnippet(
  field: SearchSnippet['field'],
  normalized: string,
  units: readonly string[],
): SearchSnippet | undefined {
  // SQLite byte windows may have a boundary replacement character; neither
  // this safe excerpt nor its ranges are ever applied to saved source text.
  normalized = normalized.split('\0').join('␀');
  const points = [...normalized];
  const first = units
    .map((u) => normalized.indexOf(u))
    .filter((n) => n >= 0)
    .sort((a, b) => a - b)[0];
  if (first === undefined) return;
  const pointIndex = [...normalized.slice(0, first)].length;
  const start = Math.max(0, pointIndex - 48);
  const text = points.slice(start, start + 320).join('');
  const ranges: [number, number][] = [];
  for (const unit of units) {
    let from = 0,
      at: number;
    while ((at = text.indexOf(unit, from)) >= 0) {
      ranges.push([at, at + unit.length]);
      from = at + 1;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  const segments: SearchSegment[] = [];
  if (start) segments.push({ text: '…', highlighted: false });
  let end = 0;
  for (const [a, b] of merged) {
    if (a > end)
      segments.push({ text: text.slice(end, a), highlighted: false });
    segments.push({ text: text.slice(a, b), highlighted: true });
    end = b;
  }
  if (end < text.length)
    segments.push({ text: text.slice(end), highlighted: false });
  if (start + 320 < points.length)
    segments.push({ text: '…', highlighted: false });
  return { field, segments };
}
