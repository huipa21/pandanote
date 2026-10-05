import { sql, type SQL } from 'drizzle-orm';
import { notes } from '../db/schema.ts';

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
export function searchPredicates(
  units: readonly string[],
  accelerate = true,
): SQL[] {
  if (!units.length) return [];
  const predicates: SQL[] = [];
  const candidates = accelerate
    ? units.map(trigramLiteral).filter((v): v is string => v !== null)
    : [];
  if (candidates.length)
    predicates.push(
      sql`${notes.id} in (select note_id from note_search_fts where note_search_fts match ${candidates.join(' AND ')})`,
    );
  for (const unit of units)
    predicates.push(
      sql`exists (select 1 from note_search s where s.note_id=${notes.id} and (instr(s.body_normalized,${unit}) > 0 or exists(select 1 from json_each(s.tag_fields_json) where instr(value,${unit}) > 0) or exists(select 1 from json_each(s.filename_fields_json) where instr(value,${unit}) > 0)))`,
    );
  return predicates;
}
/** Only a bounded normalized body window crosses the DB boundary. Filename/tag
 * arrays yield one matching field each, never a phrase joined across fields. */
export function snippetColumns(units: readonly string[]) {
  if (!units.length)
    return {
      searchBody: sql<string | null>`null`,
      searchTag: sql<string | null>`null`,
      searchFilename: sql<string | null>`null`,
    };
  const first = sql`coalesce(${sql.join(
    units.map(
      (u) =>
        sql`nullif(instr(cast(s.body_normalized as blob),cast(${u} as blob)),0)`,
    ),
    sql`, `,
  )},1)`;
  return {
    searchBody: sql<
      string | null
    >`(select cast(substr(cast(s.body_normalized as blob),max(1,${first}-192),1280) as text) from note_search s where s.note_id=${notes.id})`,
    searchTag: sql<
      string | null
    >`(select substr(value,1,320) from note_search s,json_each(s.tag_fields_json) where s.note_id=${notes.id} and (${literalFieldPredicate(units, sql`value`)}) limit 1)`,
    searchFilename: sql<
      string | null
    >`(select substr(value,max(1,coalesce(${sql.join(
      units.map((u) => sql`nullif(instr(value,${u}),0)`),
      sql`, `,
    )},1)-48),320) from note_search s,json_each(s.filename_fields_json) where s.note_id=${notes.id} and (${literalFieldPredicate(units, sql`value`)}) limit 1)`,
  };
}
