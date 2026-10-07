import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { connectDatabase } from '../../src/lib/server/db/connection.ts';
import {
  applyMigrations,
  loadMigrations,
} from '../../src/lib/server/db/migrations.ts';

it('upgrades baseline v1 with original multilingual fields intact; SQL/backfill failure leaves v1 usable', () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-search-upgrade-'));
  const db = connectDatabase(join(root, 'test.sqlite'));
  try {
    const migrations = loadMigrations();
    applyMigrations(db, migrations.slice(0, 1));
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
        migrations[0],
        {
          ...migrations[1],
          statements: [
            ...migrations[1].statements,
            'insert into nonexistent values (1)',
          ],
        },
      ]),
    ).toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(1);
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

it('uses the shared SQL/data runner on an isolated known-v1 staging copy without altering live data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-staged-migration-'));
  const live = connectDatabase(join(root, 'live.sqlite'));
  try {
    applyMigrations(live, loadMigrations().slice(0, 1));
    const id = randomUUID();
    live
      .prepare(
        "INSERT INTO notes(id,body_markdown,status,timeline_at,created_at,updated_at) VALUES (?,?,'published',1,1,1)",
      )
      .run(id, 'ＣＡＦＥ́ 香港 図書館');
    const before = live.prepare('SELECT * FROM notes').all();
    await live.backup(join(root, 'staged.sqlite'));
    const staged = new Database(join(root, 'staged.sqlite'), {
      fileMustExist: true,
    });
    try {
      staged.pragma('foreign_keys=ON');
      staged.pragma('trusted_schema=OFF');
      staged.pragma('journal_mode=DELETE');
      applyMigrations(staged, loadMigrations(), { now: 123 });
      expect(staged.pragma('user_version', { simple: true })).toBe(2);
      expect(
        staged.prepare('SELECT body_normalized FROM note_search').get(),
      ).toEqual({ body_normalized: 'café 香港 図書館' });
      expect(
        staged
          .prepare(
            'SELECT data_step,applied_at FROM __pandanote_migrations WHERE version=2',
          )
          .get(),
      ).toEqual({ data_step: 'rebuild-search-v1', applied_at: 123 });
      expect(staged.prepare('SELECT * FROM notes').all()).toEqual(before);
    } finally {
      staged.close();
    }
    expect(live.pragma('user_version', { simple: true })).toBe(1);
    expect(live.prepare('SELECT * FROM notes').all()).toEqual(before);
    expect(live.prepare('SELECT count(*) n FROM note_search').get()).toEqual({
      n: 0,
    });
  } finally {
    live.close();
    rmSync(root, { recursive: true, force: true });
  }
});
