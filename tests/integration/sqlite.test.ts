import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { normalize, search } from '../spikes/search';

it('uses real WAL/FULL/foreign keys, online backup, Drizzle and FTS5 trigram', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pandanote-sqlite-'));
  const db = new Database(join(root, 'live.sqlite'));
  try {
    expect(db.pragma('journal_mode = WAL', { simple: true })).toBe('wal');
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('wal_autocheckpoint = 0');
    expect(db.pragma('synchronous', { simple: true })).toBe(2);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    db.exec(`CREATE TABLE samples (id INTEGER PRIMARY KEY, normalized TEXT NOT NULL);
      CREATE VIRTUAL TABLE samples_fts USING fts5(normalized, tokenize='trigram');`);
    const contents = [
      'Learning TypeScript today',
      '今日食咗點心，之後去香港。',
      '今天学习数据库，也喝了咖啡。',
      '今日は図書館に行った。日本語のメモ。',
      '猫が好き',
      '100% x_y OR NEAR a"b a*b foo-bar 😀😀😀 ＡＢＣ e\u0301',
      '資料庫',
    ];
    db.transaction(() => {
      contents.forEach((text, index) => {
        db.prepare('INSERT INTO samples VALUES (?, ?)').run(
          index + 1,
          normalize(text),
        );
        db.prepare(
          'INSERT INTO samples_fts(rowid, normalized) VALUES (?, ?)',
        ).run(index + 1, normalize(text));
      });
    })();
    for (const query of [
      'typescript',
      'typescrpt',
      '點心',
      '香港',
      '港',
      '猫',
      '数据库',
      '資料庫',
      '図書館',
      'としょかん',
      '%',
      '_',
      '100%',
      'x_y',
      'OR',
      'NEAR',
      'a"b',
      'a*b',
      'foo-bar',
      '😀😀😀',
      'abc',
      'é',
      "' OR 1=1 --",
    ]) {
      const oracle = contents.flatMap((text, index) =>
        normalize(text).includes(normalize(query)) ? [index + 1] : [],
      );
      expect(search(db, query), query).toEqual(oracle);
    }
    // Explicitly prove non-Latin trigram candidates, not just fallback results.
    for (const query of ['数据库', '図書館', 'typescript']) {
      expect(
        db
          .prepare('SELECT rowid FROM samples_fts WHERE samples_fts MATCH ?')
          .all(`"${query}"`),
      ).toHaveLength(1);
    }
    expect(
      drizzle(db).get<{ count: number }>(
        sql`SELECT count(*) AS count FROM samples`,
      ),
    ).toEqual({ count: 7 });
    expect((await stat(join(root, 'live.sqlite-wal'))).size).toBeGreaterThan(0);
    await db.backup(join(root, 'snapshot.sqlite'));
    const snapshot = new Database(join(root, 'snapshot.sqlite'), {
      readonly: true,
    });
    try {
      expect(snapshot.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(
        snapshot.prepare('SELECT * FROM samples ORDER BY id').all(),
      ).toEqual(db.prepare('SELECT * FROM samples ORDER BY id').all());
      expect(search(snapshot, '数据库')).toEqual([3]);
    } finally {
      snapshot.close();
    }
    const { version } = db
      .prepare('SELECT sqlite_version() AS version')
      .get() as { version: string };
    console.info(`SQLite ${version}; real WAL/backup/trigram OK`);
  } finally {
    db.close();
    await rm(root, { recursive: true, force: true });
  }
});
