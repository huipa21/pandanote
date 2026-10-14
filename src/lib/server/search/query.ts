import { sql, type SQL } from 'drizzle-orm';
import { notes } from '../db/schema.ts';
import {
  positiveSearch,
  type SearchNode,
  type SearchQuery,
} from '../../shared/search.ts';

/** Conservative tested subset. Short units, punctuation, marks, supplementary
 * characters and controls scan literally. Narrowing this set affects speed only.
 * A whole unit is quoted even though no operators can enter this subset. */
export function trigramLiteral(unit: string): string | null {
  if (
    [...unit].length < 3 ||
    !/^[\p{L}\p{N} ]+$/u.test(unit) ||
    [...unit].some((point) => point.codePointAt(0)! > 0xffff)
  )
    return null;
  return `"${unit.replace(/"/g, '""')}"`;
}
export function literalFieldPredicate(
  units: readonly string[],
  field: SQL,
): SQL {
  return sql.join(
    units.map((u) => sql`instr(${field},${u}) > 0`),
    sql` or `,
  );
}
/** Compiles the boolean tree to SQL. Only the leaves differ per use (notes vs
 * tag names); every value is a bound parameter and no query text becomes SQL. */
export function compileSearch(
  node: SearchNode,
  leaf: { term: (value: string) => SQL; tag: (value: string) => SQL },
): SQL {
  switch (node.type) {
    case 'term':
      return leaf.term(node.value);
    case 'tag':
      return leaf.tag(node.value);
    case 'not':
      return sql`not (${compileSearch(node.node, leaf)})`;
    case 'and':
    case 'or':
      return sql`(${sql.join(
        node.nodes.map((n) => compileSearch(n, leaf)),
        node.type === 'and' ? sql` and ` : sql` or `,
      )})`;
  }
}
/** A sound over-approximation of the matching notes as an FTS5 expression, or
 * null when the tree cannot be narrowed safely. AND may use any indexable
 * child; OR only when every branch is indexable; NOT never narrows. Built
 * solely from quoted literals joined by fixed keywords. */
export function ftsCandidates(node: SearchNode): string | null {
  switch (node.type) {
    case 'term':
    case 'tag':
      // Tags are part of the indexed text, so an exact tag implies its literal.
      return trigramLiteral(node.value);
    case 'not':
      return null;
    case 'and': {
      const parts = node.nodes
        .map(ftsCandidates)
        .filter((v): v is string => v !== null);
      return parts.length ? `(${parts.join(' AND ')})` : null;
    }
    case 'or': {
      const parts = node.nodes.map(ftsCandidates);
      return parts.every((v) => v !== null)
        ? `(${(parts as string[]).join(' OR ')})`
        : null;
    }
  }
}
const termSql = (value: string) =>
  sql`exists (select 1 from note_search s where s.note_id=${notes.id} and (instr(s.body_normalized,${value}) > 0 or exists(select 1 from json_each(s.tag_fields_json) where instr(value,${value}) > 0) or exists(select 1 from json_each(s.filename_fields_json) where instr(value,${value}) > 0)))`;
const tagSql = (value: string) =>
  sql`exists (select 1 from note_search s, json_each(s.tag_fields_json) where s.note_id=${notes.id} and value = ${value})`;
export function searchPredicates(
  search: SearchQuery,
  accelerate = true,
): SQL[] {
  if (!search) return [];
  const predicates: SQL[] = [];
  const candidates = accelerate ? ftsCandidates(search) : null;
  if (candidates)
    predicates.push(
      sql`${notes.id} in (select note_id from note_search_fts where note_search_fts match ${candidates})`,
    );
  predicates.push(compileSearch(search, { term: termSql, tag: tagSql }));
  return predicates;
}
/** Only a bounded normalized body window crosses the DB boundary. Filename/tag
 * arrays yield one matching field each, never a phrase joined across fields.
 * Only terms/tags that must be present are highlighted (never NOT operands). */
export function snippetColumns(search: SearchQuery) {
  const { terms, tags } = positiveSearch(search);
  const none = sql<string | null>`null`;
  if (!terms.length && !tags.length)
    return { searchBody: none, searchTag: none, searchFilename: none };
  const tagMatch = [
    ...(terms.length ? [literalFieldPredicate(terms, sql`value`)] : []),
    ...tags.map((t) => sql`value = ${t}`),
  ];
  const first = terms.length
    ? sql`coalesce(${sql.join(
        terms.map(
          (u) =>
            sql`nullif(instr(cast(s.body_normalized as blob),cast(${u} as blob)),0)`,
        ),
        sql`, `,
      )},1)`
    : null;
  return {
    searchBody: first
      ? sql<
          string | null
        >`(select cast(substr(cast(s.body_normalized as blob),max(1,${first}-192),1280) as text) from note_search s where s.note_id=${notes.id})`
      : none,
    searchTag: sql<
      string | null
    >`(select substr(value,1,320) from note_search s,json_each(s.tag_fields_json) where s.note_id=${notes.id} and (${sql.join(tagMatch, sql` or `)}) limit 1)`,
    searchFilename: terms.length
      ? sql<string | null>`(select substr(value,max(1,coalesce(${sql.join(
          terms.map((u) => sql`nullif(instr(value,${u}),0)`),
          sql`, `,
        )},1)-48),320) from note_search s,json_each(s.filename_fields_json) where s.note_id=${notes.id} and (${literalFieldPredicate(terms, sql`value`)}) limit 1)`
      : none,
  };
}
