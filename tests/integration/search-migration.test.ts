import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { connectDatabase } from '../../src/lib/server/db/connection.ts';
import {
  applyMigrations,
  loadMigrations,
} from '../../src/lib/server/db/migrations.ts';

it('upgrades v3 with original multilingual fields intact; an S10 SQL/backfill failure leaves v3 usable', () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-search-upgrade-'));
  const db = connectDatabase(join(root, 'test.sqlite'));
  try {
    const migrations = loadMigrations();
    applyMigrations(db, migrations.slice(0, 3));
    const id = randomUUID(),
      tag = randomUUID(),
      file = randomUUID();
    const source = 'ＣＡＦＥ́ 香港 図書館 % _ OR NEAR';
    db.prepare(
      "insert into notes(id,body_markdown,status,prior_status,timeline_at,created_at,updated_at) values (?,?,'trash','published',1,1,1)",
    ).run(id, source);
    db.prepare(
      'insert into tags(id,normalized_key,display) values (?,?,?)',
    ).run(tag, 'work', 'Work');
    db.prepare('insert into note_tags values (?,?)').run(id, tag);
    db.prepare(
      "insert into attachments(id,kind,original_filename,detected_mime,incoming_digest,incoming_bytes,file_bytes,file_digest,readiness,created_at) values (?,'file','香港ＳＨＯＰ.pdf','application/pdf',?,4,4,?,'ready',1)",
    ).run(file, 'a'.repeat(64), 'a'.repeat(64));
    db.prepare(
      'insert into note_attachments(note_id,attachment_id,ordinal) values (?,?,0)',
    ).run(id, file);
    const before = db.prepare('select * from notes').all();
    expect(() =>
      applyMigrations(db, [
        ...migrations.slice(0, 3),
        {
          ...migrations[3],
          statements: [
            ...migrations[3].statements,
            'insert into nonexistent values (1)',
          ],
        },
      ]),
    ).toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(
      db
        .prepare(
          "select name from sqlite_master where name like 'note_search_fts%'",
        )
        .all(),
    ).toEqual([]);
    expect(db.prepare('select * from notes').all()).toEqual(before);
    applyMigrations(db);
    expect(
      db
        .prepare(
          'select body_normalized,tag_fields_json,filename_fields_json,source_revision from note_search',
        )
        .get(),
    ).toEqual({
      body_normalized: 'café 香港 図書館 % _ or near',
      tag_fields_json: '["work"]',
      filename_fields_json: '["香港shop.pdf"]',
      source_revision: 1,
    });
    expect(
      db
        .prepare(
          'select note_id from note_search_fts where note_search_fts match ?',
        )
        .all('"図書館"'),
    ).toEqual([{ note_id: id }]);
    expect(db.prepare('select * from notes').all()).toEqual(before);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
