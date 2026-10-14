import { expect, it } from 'vitest';
import {
  parseSearch,
  canonicalSearch,
  normalizeSearch,
  matchesSearch,
  searchSnippet,
  positiveSearch,
} from '../../src/lib/shared/search.ts';
import { DomainError } from '../../src/lib/shared/domain.ts';
import {
  canonicalFilters,
  filterKey,
  filterHref,
  parseTimelineQuery,
} from '../../src/lib/shared/timeline.ts';
import {
  ftsCandidates,
  trigramLiteral,
} from '../../src/lib/server/search/query.ts';

const canon = (q: string) => canonicalSearch(q);
it('parses bounded literal AND units, whole quoted phrases and explicit escapes', () => {
  expect(canon('ＣＯＦＦＥＥ shop "exact phrase"')).toBe(
    '"coffee" "exact phrase" "shop"',
  );
  expect(canon('"say \\"hello\\"" \\\\path')).toBe(
    '"\\\\path" "say \\"hello\\""',
  );
  // Lower-case operators, wildcards and other punctuation are still literal data.
  expect(canon('\\x or near % _ * and not')).toBe(
    '"%" "*" "\\\\x" "_" "and" "near" "not" "or"',
  );
  expect(canon('shop COFFEE coffee')).toBe(canon('coffee shop'));
  for (const query of [
    '\0',
    '"',
    '""',
    '"abc"def',
    'abc"def',
    'a '.repeat(21),
    '猫'.repeat(257),
  ])
    expect(() => parseSearch(query)).toThrow();
  expect(parseSearch('😊'.repeat(256))).toEqual({
    type: 'term',
    value: '😊'.repeat(256),
  });
  expect(parseSearch(' \t\n ')).toBeNull();
});
it('parses AND/OR/NOT/parentheses with NOT > AND > OR precedence and implicit AND', () => {
  expect(canon('a b OR c')).toBe('"c" OR "a" "b"');
  expect(canon('a OR b c')).toBe('"a" OR "b" "c"');
  expect(canon('(a OR b) c')).toBe('"c" ("a" OR "b")');
  expect(canon('a AND NOT b')).toBe('"a" NOT "b"');
  expect(canon('NOT a b')).toBe('"b" NOT "a"');
  expect(canon('NOT (a b)')).toBe('NOT ("a" "b")');
  expect(canon('NOT NOT a')).toBe('"a"');
  expect(canon('((a))')).toBe('"a"');
  expect(canon('a OR (b OR c) OR a')).toBe('"a" OR "b" OR "c"');
  expect(canon('c OR b OR a')).toBe(canon('a OR b OR c'));
  expect(canon('（a OR b）c')).toBe(canon('(a OR b) c'));
  expect(canon('tag:Work tag:#work TAG:ｗｏｒｋ')).toBe('tag:"work"');
  expect(canon('tag:"a b"')).toBe('tag:"a b"');
  // Quoting makes everything literal again.
  expect(canon('"a OR b" "(x)" "tag:y" "NOT"')).toBe(
    '"(x)" "a or b" "not" "tag:y"',
  );
});
it('rejects malformed boolean syntax with validation errors and enforces bounds', () => {
  for (const query of [
    'a AND',
    'OR a',
    'a OR OR b',
    'AND',
    'NOT',
    'a NOT',
    '()',
    '( )',
    '(a',
    'a)',
    '(a))',
    '((a)',
    '(a OR)',
    'tag:',
    'tag:#',
    'tag:""',
    'a OR '.repeat(21) + 'a',
    'NOT '.repeat(9) + 'a',
    '('.repeat(9) + 'a' + ')'.repeat(9),
    'a AND '.repeat(41) + 'a',
  ])
    expect(() => parseSearch(query), query).toThrow(DomainError);
  // Operators are not units; the 20-unit limit counts terms and tags.
  expect(() => parseSearch(Array(20).fill('a').join(' OR '))).not.toThrow();
  expect(() => parseSearch('('.repeat(8) + 'a' + ')'.repeat(8))).not.toThrow();
});
it('canonical form round-trips and is stable for random boolean expressions', () => {
  let state = 7;
  const next = (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n;
  };
  const leaf = () =>
    ['a', 'b', '"c d"', 'tag:x', 'ＡＢ', '香港', '"OR"', '"("'][next(8)];
  const gen = (depth: number): string => {
    const r = next(depth > 2 ? 2 : 7);
    if (r < 2) return leaf();
    if (r === 2) return `NOT ${gen(depth + 1)}`;
    if (r === 3) return `(${gen(depth + 1)})`;
    return `${gen(depth + 1)} ${['AND', 'OR', ''][next(3)]} ${gen(depth + 1)}`;
  };
  for (let i = 0; i < 300; i++) {
    const query = gen(0);
    const once = canonicalSearch(query);
    expect(canonicalSearch(once), query).toBe(once);
    expect(parseSearch(once)).toEqual(parseSearch(query));
  }
});
it('evaluates boolean queries over separate fields, tags and negation', () => {
  const m = (q: string, fields: string[], tags: string[] = []) =>
    matchesSearch(fields, parseSearch(q), tags);
  expect(m('coffee OR tea', ['tea time'])).toBe(true);
  expect(m('coffee AND tea', ['tea time'])).toBe(false);
  expect(m('coffee NOT tea', ['coffee time'])).toBe(true);
  expect(m('coffee NOT tea', ['coffee tea'])).toBe(false);
  expect(m('NOT coffee', ['tea'])).toBe(true);
  expect(m('NOT coffee', [])).toBe(true);
  expect(m('NOT (a OR b)', ['c'])).toBe(true);
  expect(m('NOT (a OR b)', ['b'])).toBe(false);
  // NOT is note-level: any field containing the term excludes the note.
  expect(m('NOT shop', ['coffee', 'shop.pdf'])).toBe(false);
  // A bare term is a substring of any field; tag: is exact.
  expect(m('work', ['work-log'], ['work-log'])).toBe(true);
  expect(m('tag:work', ['x'], ['work-log'])).toBe(false);
  expect(m('tag:work', ['x'], ['Work'])).toBe(true);
  expect(m('tag:work OR tag:home', ['x'], ['home'])).toBe(true);
  expect(m('"a OR b"', ['a or b'])).toBe(true);
  expect(m('"a OR b"', ['a'])).toBe(false);
  expect(m('', ['anything'])).toBe(true);
});
it('highlights only terms that must be present', () => {
  const pos = (q: string) => positiveSearch(parseSearch(q));
  expect(pos('a OR NOT b')).toEqual({ terms: ['a'], tags: [] });
  expect(pos('NOT (a OR NOT b)')).toEqual({ terms: ['b'], tags: [] });
  expect(pos('NOT a')).toEqual({ terms: [], tags: [] });
  expect(pos('x tag:y NOT tag:z')).toEqual({ terms: ['x'], tags: ['y'] });
});
it('normalizes width/case/combining forms, not readings, accents or Han variants', () => {
  expect(normalizeSearch('ＴｙｐｅＳｃｒｉｐｔ e\u0301')).toBe('typescript é');
  const examples: [string, string, boolean][] = [
    ['Learning TypeScript today', 'typescript', true],
    ['Learning TypeScript today', 'typescrpt', false],
    ['今日食咗點心', '點心', true],
    ['去香港飲茶', '香港', true],
    ['猫が好き', '猫', true],
    ['今天学习数据库', '数据库', true],
    ['今天学习数据库', '資料庫', false],
    ['今日は図書館に行った', '図書館', true],
    ['今日は図書館に行った', 'としょかん', false],
    ['coffee at a new shop', 'coffee shop', true],
    ['coffee at a new shop', '"coffee shop"', false],
    ['visited a coffee shop', '"coffee shop"', true],
    ['café', 'cafe', false],
  ];
  for (const [body, query, match] of examples)
    expect(matchesSearch([body], parseSearch(query))).toBe(match);
  expect(
    matchesSearch(['coffee', 'shop.pdf'], parseSearch('coffee shop')),
  ).toBe(true);
  expect(
    matchesSearch(['coffee', 'shop.pdf'], parseSearch('"coffee shop"')),
  ).toBe(false);
});
it('conservatively accelerates codepoint-long plain units and scans all unsupported edges', () => {
  for (const unit of [
    'typescript',
    '数据库',
    '図書館',
    'coffee shop',
    'OR NEAR',
  ])
    expect(trigramLiteral(unit)).toBe(`"${unit}"`);
  for (const unit of [
    '猫',
    '香港',
    '😊😊',
    'abc%',
    'foo_bar',
    'e\u0301xx',
    '𠮷野家',
    'a\0bc',
    '"OR"',
  ])
    expect(trigramLiteral(unit)).toBeNull();
});
it('binds canonical query and half-open day alongside the tag in cursor identity/URLs', () => {
  const a = canonicalFilters('Work', 'COFFEE shop', { start: 100, end: 200 });
  expect(filterKey(a)).toBe(
    filterKey(
      canonicalFilters('ｗｏｒｋ', 'shop coffee', { start: 100, end: 200 }),
    ),
  );
  expect(
    parseTimelineQuery(
      new URL(filterHref(a), 'https://example.test').searchParams,
    ).filters,
  ).toEqual(a);
  for (const query of [
    'q=a&q=b',
    'dayStart=1',
    'dayEnd=2',
    'dayStart=2&dayEnd=1',
    'dayStart=x&dayEnd=2',
  ])
    expect(() => parseTimelineQuery(new URLSearchParams(query))).toThrow();
});
it('returns escaped-by-consumer normalized segments with unioned highlights and bounded Unicode text', () => {
  const source = normalizeSearch(
    'prefix '.repeat(1000) +
      '<img src=x onerror=alert(1)> ＣＡＦＥ́ 😊 ' +
      'tail'.repeat(1000),
  );
  const snippet = searchSnippet('body', source, ['<img', 'café'])!;
  expect(
    snippet.segments.filter((s) => s.highlighted).map((s) => s.text),
  ).toEqual(['<img', 'café']);
  expect(
    [...snippet.segments.map((s) => s.text).join('')].length,
  ).toBeLessThanOrEqual(322);
  const overlap = searchSnippet('body', 'ababa', ['aba', 'bab'])!;
  expect(overlap.segments).toEqual([{ text: 'ababa', highlighted: true }]);
});
it('derives sound FTS candidates: AND narrows, OR needs every branch, NOT never narrows', () => {
  const c = (q: string) => ftsCandidates(parseSearch(q)!);
  expect(c('typescript')).toBe('"typescript"');
  expect(c('typescript 香港')).toBe('("typescript")');
  expect(c('typescript database')).toBe('("database" AND "typescript")');
  expect(c('typescript OR database')).toBe('("database" OR "typescript")');
  expect(c('typescript OR 香港')).toBeNull();
  expect(c('NOT typescript')).toBeNull();
  expect(c('database NOT typescript')).toBe('("database")');
  expect(c('(alpha OR beta) gamma')).toBe('("gamma" AND ("alpha" OR "beta"))');
  expect(c('tag:work')).toBe('"work"');
  expect(c('NOT (alpha OR beta)')).toBeNull();
});
