import { sql } from 'drizzle-orm';
import type { DomainTransaction, Persistence } from '../db/connection.ts';
import { normalizeSearch } from '../../shared/search.ts';

type Writer = Pick<DomainTransaction, 'get' | 'all' | 'run'>;
/** Called inside the source mutation transaction, after all joins change.
 * No virtual-table triggers: trusted_schema stays OFF. These explicit hooks are
 * also the contract for future tag management and immutable filename changes. */
export function removeNoteSearch(tx: Writer, id: string): void {
  tx.run(
    sql`delete from note_search_fts where rowid = (select rowid from note_search where note_id = ${id})`,
  );
}
export function refreshNoteSearch(tx: Writer, id: string): void {
  removeNoteSearch(tx, id);
  const note = tx.get<{ body: string; revision: number }>(
    sql`select body_markdown as body, revision from notes where id = ${id}`,
  );
  if (!note) {
    tx.run(sql`delete from note_search where note_id = ${id}`);
    return;
  }
  const tags = tx
    .all<{ value: string }>(
      sql`select t.normalized_key as value from note_tags nt join tags t on t.id=nt.tag_id where nt.note_id=${id} order by t.normalized_key`,
    )
    .map((r) => normalizeSearch(r.value));
  const filenames = tx
    .all<{ value: string }>(
      sql`select a.original_filename as value from note_attachments na join attachments a on a.id=na.attachment_id where na.note_id=${id} order by na.ordinal`,
    )
    .map((r) => normalizeSearch(r.value));
  const body = normalizeSearch(note.body);
  tx.run(
    sql`insert into note_search(note_id, body_normalized, tag_fields_json, filename_fields_json, source_revision) values (${id},${body},${JSON.stringify(tags)},${JSON.stringify(filenames)},${note.revision}) on conflict(note_id) do update set body_normalized=excluded.body_normalized, tag_fields_json=excluded.tag_fields_json, filename_fields_json=excluded.filename_fields_json, source_revision=excluded.source_revision`,
  );
  // Cross-field candidate phrases are harmless false positives: literal field
  // predicates ALWAYS run afterwards. FTS never defines product semantics.
  tx.run(
    sql`insert into note_search_fts(rowid, note_id, text) values ((select rowid from note_search where note_id=${id}),${id},${[body, ...tags, ...filenames].join('\n')})`,
  );
}
export function rebuildSearch(tx: Writer): number {
  tx.run(sql`delete from note_search_fts`);
  tx.run(sql`delete from note_search`);
  const ids = tx.all<{ id: string }>(sql`select id from notes order by id`);
  for (const { id } of ids) refreshNoteSearch(tx, id);
  tx.run(sql`insert into note_search_fts(note_search_fts) values ('optimize')`);
  return ids.length;
}
export function reindexSearch(p: Persistence): number {
  return p.write((tx) => rebuildSearch(tx));
}
