import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  DATA_MIGRATIONS,
  type DataMigrationRegistry,
} from './data-migrations.ts';

export const SCHEMA_VERSION = 3;
/** Only these explicitly safe messages may be printed by startup/CLI code. */
export class DatabaseUpgradeError extends Error {}
export const PRE_RELEASE_DATABASE_MESSAGE =
  'This data folder was created by a pre-release PandaNote and cannot be upgraded. Move it away and start with an empty folder.';
export const NEWER_DATABASE_MESSAGE =
  'This data was upgraded by a newer PandaNote. Use that version, or roll back with the pre-upgrade copy (see OPERATIONS.md).';
export const HISTORY_MISMATCH_DATABASE_MESSAGE =
  'Applied migration history does not match trusted application migrations (SQL hash or data step changed). This data folder is incompatible with this build, possibly from an older development baseline. No migration or reset was performed. Use the matching PandaNote build to access it. To start fresh, stop PandaNote and select a new empty private folder using DATA_DIR locally or DATA_PATH in Compose; keep the entire old folder. Do not edit the migration ledger or hashes.';
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
export interface MigrationOptions {
  dataSteps?: DataMigrationRegistry;
  now?: number;
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
  data_step: string | null;
}
const ledgerExists = (db: Database.Database): boolean =>
  Boolean(
    db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__pandanote_migrations'",
      )
      .get(),
  );
function validateTrustedHistory(
  migrations: Migration[],
  steps: DataMigrationRegistry,
): void {
  migrations.forEach((m, i) => {
    if (
      m.version !== i + 1 ||
      !/^\d{4}_[a-z0-9_]+$/.test(m.name) ||
      !/^[a-f0-9]{64}$/.test(m.hash)
    )
      throw new Error('Migration history must be contiguous and trusted');
  });
  for (const [version, step] of steps) {
    if (
      !Number.isSafeInteger(version) ||
      version < 1 ||
      !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(step.name) ||
      typeof step.run !== 'function' ||
      ['AsyncFunction', 'GeneratorFunction', 'AsyncGeneratorFunction'].includes(
        step.run.constructor.name,
      )
    )
      throw new Error('Invalid trusted data-step registry');
  }
}
/** Read-only preflight used BEFORE snapshotting and repeated under IMMEDIATE.
 * Untrusted archives must pass exact schema validation before calling this. */
export function migrationState(
  db: Database.Database,
  migrations = loadMigrations(),
  options: MigrationOptions = {},
): {
  existing: boolean;
  fromVersion: number;
  toVersion: number;
  pending: number;
} {
  const steps = options.dataSteps ?? DATA_MIGRATIONS;
  validateTrustedHistory(migrations, steps);
  const existing = ledgerExists(db);
  const version = db.pragma('user_version', { simple: true }) as number;
  if (!existing) {
    if (
      version !== 0 ||
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1",
        )
        .get()
    )
      throw new Error('Refusing to migrate an unrecognized database');
    return {
      existing: false,
      fromVersion: 0,
      toVersion: migrations.length,
      pending: migrations.length,
    };
  }
  const columns = db.pragma('table_info(__pandanote_migrations)') as {
    name: string;
  }[];
  // All histories without data-step identity are pre-release. No ledger retrofit.
  if (!columns.some((column) => column.name === 'data_step'))
    throw new DatabaseUpgradeError(PRE_RELEASE_DATABASE_MESSAGE);
  const applied = db
    .prepare(
      'SELECT version, name, hash, data_step FROM __pandanote_migrations ORDER BY version',
    )
    .all() as AppliedMigration[];
  if (applied[0]?.name === '0000_foundation')
    throw new DatabaseUpgradeError(PRE_RELEASE_DATABASE_MESSAGE);
  if (version > migrations.length || applied.length > migrations.length)
    throw new DatabaseUpgradeError(NEWER_DATABASE_MESSAGE);
  if (version !== applied.length)
    throw new Error('Database schema version and migration ledger disagree');
  for (const [index, row] of applied.entries()) {
    const known = migrations[index];
    if (
      row.version !== known.version ||
      row.hash !== known.hash ||
      row.name !== known.name ||
      row.data_step !== (steps.get(known.version)?.name ?? null)
    )
      throw new DatabaseUpgradeError(HISTORY_MISMATCH_DATABASE_MESSAGE);
  }
  return {
    existing: true,
    fromVersion: applied.length,
    toVersion: migrations.length,
    pending: migrations.length - applied.length,
  };
}
export function assertMigrationState(
  db: Database.Database,
  migrations = loadMigrations(),
  options: MigrationOptions = {},
): void {
  const state = migrationState(db, migrations, options);
  if (!state.existing)
    throw new Error(
      'Database is not migrated; startup initialization required',
    );
  if (state.pending)
    throw new Error(
      'Database schema version requires migration before serving',
    );
}
/** Trusted, database-only runner for fresh creation and validated restore staging.
 * Live upgrades must use upgradeDatabase() to capture the pre-upgrade copy first.
 * All pending SQL, data steps, ledger and integrity checks commit together. */
export function applyMigrations(
  db: Database.Database,
  migrations = loadMigrations(),
  options: MigrationOptions = {},
): void {
  const steps = options.dataSteps ?? DATA_MIGRATIONS;
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0)
    throw new Error('Invalid migration timestamp');
  migrationState(db, migrations, options);
  let active: Migration | undefined;
  try {
    db.transaction(() => {
      const state = migrationState(db, migrations, options);
      db.exec(
        'CREATE TABLE IF NOT EXISTS __pandanote_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, hash TEXT NOT NULL, applied_at INTEGER NOT NULL, data_step TEXT)',
      );
      for (const migration of migrations.slice(state.fromVersion)) {
        active = migration;
        for (const statement of migration.statements) db.exec(statement);
        const step = steps.get(migration.version);
        if (step) {
          const result: unknown = step.run(db, { now });
          if (result !== undefined)
            throw new Error('Data steps must be synchronous and return void');
        }
        db.prepare(
          'INSERT INTO __pandanote_migrations (version, name, hash, applied_at, data_step) VALUES (?, ?, ?, ?, ?)',
        ).run(
          migration.version,
          migration.name,
          migration.hash,
          now,
          step?.name ?? null,
        );
      }
      db.pragma(`user_version = ${migrations.length}`);
      if (
        (db.pragma('foreign_key_check') as unknown[]).length !== 0 ||
        db.pragma('integrity_check', { simple: true }) !== 'ok'
      )
        throw new Error('Database integrity validation failed');
    }).immediate();
  } catch {
    // Never expose an underlying SQL/data-step error (it may contain content).
    if (active)
      throw new DatabaseUpgradeError(
        `Database upgrade failed at migration ${active.version} (${active.name}); data unchanged.`,
      );
    throw new DatabaseUpgradeError(
      'Database upgrade could not start; data unchanged.',
    );
  }
}
