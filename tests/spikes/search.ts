import type Database from 'better-sqlite3';

export const normalize = (text: string): string =>
  text.normalize('NFKC').toLowerCase();

// Capability probe, not the S10 query parser. Conservative eligibility avoids
// tokenizer false negatives for punctuation; instr remains the semantic oracle.
export function search(db: Database.Database, input: string): number[] {
  const term = normalize(input);
  const indexable = [...term].length >= 3 && /^[\p{L}\p{N} ]+$/u.test(term);
  const rows = indexable
    ? db
        .prepare(
          `SELECT id FROM samples WHERE id IN (
        SELECT rowid FROM samples_fts WHERE samples_fts MATCH ?
      ) AND instr(normalized, ?) > 0 ORDER BY id`,
        )
        .all(`"${term.replaceAll('"', '""')}"`, term)
    : db
        .prepare(
          'SELECT id FROM samples WHERE instr(normalized, ?) > 0 ORDER BY id',
        )
        .all(term);
  return (rows as { id: number }[]).map((row) => row.id);
}
