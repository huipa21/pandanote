import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { z } from 'zod';

export const SCHEMA_VERSION = 2;
const journalSchema = z.object({
  dialect: z.literal('sqlite'),
  entries: z.array(
    z.object({
      idx: z.number().int().nonnegative(),
      tag: z.string().regex(/^\d{4}_[a-z0-9_]+$/),
    }),
  ),
});
export interface Migration {
  version: number;
  name: string;
  hash: string;
  statements: string[];
}
export function loadMigrations(folder = resolve('migrations')): Migration[] {
  const journal = journalSchema.parse(
    JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')),
  );
  if (journal.entries.length !== SCHEMA_VERSION)
    throw new Error(
      'Trusted migrations do not match the application schema version',
    );
  return journal.entries.map((entry, index) => {
    if (entry.idx !== index)
      throw new Error('Migration history must be contiguous');
    const source = readFileSync(
      join(folder, `${entry.tag}.sql`),
      'utf8',
    ).replace(/\r\n/g, '\n');
    return {
      version: index + 1,
      name: entry.tag,
      hash: createHash('sha256').update(source).digest('hex'),
      statements: source
        .split('--> statement-breakpoint')
        .map((part) => part.trim())
        .filter(Boolean),
    };
  });
}
interface AppliedMigration {
  version: number;
  name: string;
  hash: string;
}
const ledgerExists = (db: Database.Database): boolean =>
  Boolean(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__pandanote_migrations'",
      )
      .get(),
  );

export function assertMigrationState(
  db: Database.Database,
  migrations = loadMigrations(),
): void {
  if (!ledgerExists(db))
    throw new Error(
      'Database is not migrated; run npm run db:migrate before serving',
    );
  const applied = db
    .prepare(
      'SELECT version, name, hash FROM __pandanote_migrations ORDER BY version',
    )
    .all() as AppliedMigration[];
  if (
    applied.length !== migrations.length ||
    db.pragma('user_version', { simple: true }) !== migrations.length
  )
    throw new Error(
      'Database schema version is unsupported or requires migration',
    );
  for (const [index, row] of applied.entries()) {
    const migration = migrations[index];
    if (
      row.version !== migration.version ||
      row.name !== migration.name ||
      row.hash !== migration.hash
    )
      throw new Error(
        'Applied migration history does not match trusted application migrations',
      );
  }
}

/** Explicit, trusted application migrations only. All pending upgrades and the
 * ledger commit together; failure leaves the previous schema and data intact.
 * No down migrations. Do not call on archive-supplied DBs before schema validation.
 */
export function applyMigrations(
  db: Database.Database,
  migrations = loadMigrations(),
): void {
  migrations.forEach((m, i) => {
    if (m.version !== i + 1)
      throw new Error('Migration history must be contiguous');
  });
  db.transaction(() => {
    const existed = ledgerExists(db);
    const version = db.pragma('user_version', { simple: true });
    if (
      !existed &&
      (version !== 0 ||
        db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1",
          )
          .get())
    )
      throw new Error('Refusing to migrate an unrecognized database');
    db.exec(
      'CREATE TABLE IF NOT EXISTS __pandanote_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL, applied_at INTEGER NOT NULL)',
    );
    const applied = db
      .prepare(
        'SELECT version, name, hash FROM __pandanote_migrations ORDER BY version',
      )
      .all() as AppliedMigration[];
    if (version !== applied.length || applied.length > migrations.length)
      throw new Error('Unknown or newer database schema');
    for (const [index, row] of applied.entries()) {
      const known = migrations[index];
      if (
        row.version !== known.version ||
        row.hash !== known.hash ||
        row.name !== known.name
      )
        throw new Error('Applied migrations have changed');
    }
    for (const migration of migrations.slice(applied.length)) {
      for (const statement of migration.statements) db.exec(statement);
      db.prepare('INSERT INTO __pandanote_migrations VALUES (?, ?, ?, ?)').run(
        migration.version,
        migration.name,
        migration.hash,
        Date.now(),
      );
    }
    db.pragma(`user_version = ${migrations.length}`);
    if (
      (db.pragma('foreign_key_check') as unknown[]).length !== 0 ||
      db.pragma('integrity_check', { simple: true }) !== 'ok'
    )
      throw new Error('Database integrity validation failed');
  }).immediate();
}
