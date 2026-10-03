import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import {
  connectDatabase,
  Persistence,
} from '../../src/lib/server/db/connection.ts';
import {
  applyMigrations,
  assertMigrationState,
  loadMigrations,
  SCHEMA_VERSION,
} from '../../src/lib/server/db/migrations.ts';
import {
  newPrivateId,
  PrivateStorage,
} from '../../src/lib/server/storage/private-storage.ts';
import {
  initializeSettings,
  readSettings,
  replaceSettings,
} from '../../src/lib/server/settings/repository.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';
import { withPersistence } from '../helpers/persistence.ts';

it('migrates a fresh real DB, uses durable pragmas, repeats safely and seeds no account/content', async () => {
  await withPersistence(async (p) => {
    for (const [pragma, value] of Object.entries({
      foreign_keys: 1,
      journal_mode: 'wal',
      synchronous: 2,
      busy_timeout: 5000,
      trusted_schema: 0,
      user_version: SCHEMA_VERSION,
    }))
      expect(p.native.pragma(pragma, { simple: true })).toBe(value);
    const before = p.native
      .prepare('SELECT * FROM __pandanote_migrations ORDER BY version')
      .all();
    applyMigrations(p.native);
    expect(
      p.native
        .prepare('SELECT * FROM __pandanote_migrations ORDER BY version')
        .all(),
    ).toEqual(before);
    const inspector = new Database(p.storage.databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      expect(inspector.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(inspector.pragma('foreign_key_check')).toEqual([]);
      expect(
        inspector.prepare('SELECT count(*) AS n FROM account').get(),
      ).toEqual({ n: 0 });
      expect(
        inspector.prepare('SELECT count(*) AS n FROM notes').get(),
      ).toEqual({ n: 0 });
      expect(
        (inspector.pragma('table_info(notes)') as { name: string }[]).map(
          (v) => v.name,
        ),
      ).not.toContain('title');
      expect(
        inspector
          .prepare(
            "SELECT name FROM sqlite_master WHERE name LIKE '%role%' OR name LIKE '%user%'",
          )
          .all(),
      ).toEqual([]);
      const names = inspector
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all()
        .map((r) => (r as { name: string }).name);
      expect(names).toEqual(
        expect.arrayContaining([
          'notes_status_timeline',
          'note_tags_tag_note',
          'note_attachments_attachment_note',
          'note_attachments_order',
          'tags_normalized_key',
          'upload_batches_mutation',
          'sessions_expiry',
          'recovery_unconsumed',
          'cleanup_pending',
        ]),
      );
      const columns = inspector.pragma(
        'index_xinfo(notes_status_timeline)',
      ) as { name: string; desc: number; key: number }[];
      expect(columns.filter((c) => c.key).map((c) => [c.name, c.desc])).toEqual(
        [
          ['status', 0],
          ['timeline_at', 1],
          ['id', 1],
        ],
      );
    } finally {
      inspector.close();
    }
    expect(readSettings(p)).toEqual(DEFAULT_SETTINGS);
    replaceSettings(p, {
      ...DEFAULT_SETTINGS,
      timezone: 'Asia/Tokyo',
      density: 'compact',
    });
    initializeSettings(p);
    expect(readSettings(p).timezone).toBe('Asia/Tokyo');
    await p.close();
    const reopened = new Persistence(p.storage);
    try {
      expect(readSettings(reopened).density).toBe('compact');
    } finally {
      await reopened.close();
    }
  });
});

it('upgrades an existing earlier schema without losing notes and rolls back a failed upgrade', () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-migration-'));
  const db = connectDatabase(join(root, 'test.sqlite'));
  try {
    const migrations = loadMigrations();
    applyMigrations(db, migrations.slice(0, 1));
    const noteId = newPrivateId();
    db.prepare(
      "INSERT INTO notes (id, body_markdown, status, timeline_at, created_at, updated_at) VALUES (?, 'synthetic', 'published', 1, 1, 1)",
    ).run(noteId);
    expect(() => assertMigrationState(db)).toThrow(/version/);
    const failed = {
      ...migrations[1],
      statements: [
        ...migrations[1].statements,
        'CREATE TABLE partial_upgrade (id INTEGER)',
        'INSERT INTO missing_table VALUES (1)',
      ],
    };
    expect(() => applyMigrations(db, [migrations[0], failed])).toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' OR name = 'partial_upgrade'",
        )
        .all(),
    ).toEqual([]);
    expect(
      db.prepare('SELECT count(*) AS n FROM __pandanote_migrations').get(),
    ).toEqual({ n: 1 });
    applyMigrations(db);
    assertMigrationState(db);
    expect(
      db
        .prepare('SELECT body_markdown, revision FROM notes WHERE id = ?')
        .get(noteId),
    ).toEqual({ body_markdown: 'synthetic', revision: 1 });
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
    const badHistory = [
      { ...migrations[0], hash: '0'.repeat(64) },
      migrations[1],
    ];
    expect(() => applyMigrations(db, badHistory)).toThrow(/changed/);
    expect(() => applyMigrations(db, migrations.slice(0, 1))).toThrow(/newer/);
    expect(() => assertMigrationState(db, badHistory)).toThrow(/history/);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it('rolls back a failed fresh migration and refuses unknown existing schema or runtime auto-migration', () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-migration-'));
  const storage = new PrivateStorage({ dataDir: root });
  storage.initializeKeys();
  const db = connectDatabase(storage.databasePath);
  try {
    const migrations = loadMigrations();
    expect(() =>
      applyMigrations(db, [
        {
          ...migrations[0],
          statements: [...migrations[0].statements, 'invalid sql'],
        },
      ]),
    ).toThrow();
    expect(db.prepare('SELECT name FROM sqlite_master').all()).toEqual([]);
    expect(db.pragma('user_version', { simple: true })).toBe(0);
    expect(() => new Persistence(storage)).toThrow(/not migrated/);
    db.exec('CREATE TABLE unknown (id INTEGER)');
    expect(() => applyMigrations(db)).toThrow(/unrecognized/);
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE name = '__pandanote_migrations'",
        )
        .get(),
    ).toBeUndefined();
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
