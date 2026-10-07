import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { idSchema } from '../../shared/domain.ts';
import {
  diskSpace,
  diskReserveFromEnv,
  type DiskSpace,
} from '../attachments/resources.ts';
import {
  PrivateStorage,
  syncDirectory,
  writePrivateJson,
} from '../storage/private-storage.ts';
import {
  applyMigrations,
  loadMigrations,
  migrationState,
  DatabaseUpgradeError,
  type Migration,
  type MigrationOptions,
} from './migrations.ts';

const manifestSchema = z
  .strictObject({
    version: z.literal(1),
    fromSchemaVersion: z.number().int().nonnegative(),
    toSchemaVersion: z.number().int().positive(),
    appVersion: z.string().regex(/^(?:Development|\d{6}-[1-9]\d*)$/),
    createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .refine((value) => value.toSchemaVersion > value.fromSchemaVersion);
export type PreUpgradeManifest = z.infer<typeof manifestSchema>;
const journalSchema = z.strictObject({
  version: z.literal(1),
  hadPrevious: z.boolean(),
  phase: z.enum(['prepared', 'installed']),
});
export type UpgradeBoundary =
  'prepared' | 'retained' | 'published' | 'installed';
export interface UpgradeOptions extends MigrationOptions {
  appVersion: string;
  reserveBytes?: number;
  inspectDisk?: (path: string) => DiskSpace;
  /** Fault-injection seam, never driven by HTTP/environment input. */
  onBoundary?: (boundary: UpgradeBoundary) => void;
}
function readBoundedJson(path: string): unknown {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096)
    throw new Error('Invalid pre-upgrade metadata');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function checkedFiles(path: string, temporary = false): void {
  const allowed = ['pandanote.sqlite', 'manifest.json'];
  if (temporary)
    allowed.push(
      'pandanote.sqlite-wal',
      'pandanote.sqlite-shm',
      'pandanote.sqlite-journal',
    );
  for (const name of readdirSync(path)) {
    const interruptedJson =
      temporary &&
      name.startsWith('.') &&
      name.endsWith('.tmp') &&
      idSchema.safeParse(name.slice(1, -4)).success;
    if (!allowed.includes(name) && !interruptedJson)
      throw new Error('Unexpected pre-upgrade file');
    const stat = lstatSync(join(path, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
      throw new Error('Unsafe pre-upgrade file');
  }
}
function discard(path: string, temporary = false): void {
  if (!existsSync(path)) return;
  checkedFiles(path, temporary);
  rmSync(path, { recursive: true });
}
function verifyCopy(path: string): void {
  checkedFiles(path);
  const manifest = manifestSchema.parse(
    readBoundedJson(join(path, 'manifest.json')),
  );
  const snapshot = new Database(join(path, 'pandanote.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    snapshot.pragma('trusted_schema=OFF');
    if (
      snapshot.pragma('user_version', { simple: true }) !==
        manifest.fromSchemaVersion ||
      snapshot.pragma('integrity_check', { simple: true }) !== 'ok' ||
      (snapshot.pragma('foreign_key_check') as unknown[]).length
    )
      throw new Error('Invalid pre-upgrade database');
  } finally {
    snapshot.close();
  }
}
/** Portable Node cannot rename over a nonempty directory. Durable rotation keeps
 * the previous copy until the new copy is published and committed. Recovery runs
 * before migrations/HTTP, so a crash never requires an incomplete copy for rollback.
 * This is crash-safe replacement, NOT a single atomic directory exchange. */
export function recoverPreUpgrade(storage: PrivateStorage): void {
  const current = storage.preUpgradeDirectory('current');
  const temp = storage.preUpgradeDirectory('temporary');
  const previous = storage.preUpgradeDirectory('previous');
  const journal = storage.preUpgradeJournalPath();
  if (!existsSync(journal)) {
    if (existsSync(previous))
      throw new Error('Pre-upgrade recovery requires operator inspection');
    discard(temp, true);
    syncDirectory(storage.root);
    return;
  }
  const state = journalSchema.parse(readBoundedJson(journal));
  if (state.phase === 'installed') {
    verifyCopy(current);
    discard(previous);
  } else if (state.hadPrevious) {
    if (existsSync(previous)) {
      verifyCopy(previous);
      discard(current);
      renameSync(previous, current);
    } else {
      if (!existsSync(current))
        throw new Error('Pre-upgrade recovery requires operator inspection');
      verifyCopy(current);
    }
  } else {
    if (existsSync(previous))
      throw new Error('Unexpected pre-upgrade recovery state');
    discard(current);
  }
  discard(temp, true);
  syncDirectory(storage.root);
  unlinkSync(journal);
  syncDirectory(join(storage.root, 'private'));
}
async function createCopy(
  db: Database.Database,
  storage: PrivateStorage,
  manifest: PreUpgradeManifest,
  options: UpgradeOptions,
): Promise<void> {
  // page_count includes uncheckpointed WAL pages; main-file stat alone does not.
  const copyBytes = Math.ceil(
    Number(db.pragma('page_count', { simple: true })) *
      Number(db.pragma('page_size', { simple: true })) *
      1.1,
  );
  const disk = (options.inspectDisk ?? diskSpace)(storage.root);
  const reserve =
    options.reserveBytes ??
    diskReserveFromEnv() ??
    Math.max(5 * 1024 ** 3, Math.ceil(disk.total / 10));
  if (
    !Number.isSafeInteger(copyBytes) ||
    copyBytes < 0 ||
    !Number.isSafeInteger(reserve) ||
    reserve < 0 ||
    !Number.isSafeInteger(disk.available) ||
    disk.available < 0
  )
    throw new Error('Invalid pre-upgrade disk budget');
  const required = copyBytes + 4096 + reserve;
  if (!Number.isSafeInteger(required))
    throw new Error('Invalid pre-upgrade disk budget');
  if (disk.available < required)
    throw new DatabaseUpgradeError(
      `Not enough free space for the pre-upgrade copy: need ${required} bytes including disk reserve; ${disk.available} bytes available.`,
    );
  const temp = storage.preUpgradeDirectory('temporary', true);
  const current = storage.preUpgradeDirectory('current');
  const previous = storage.preUpgradeDirectory('previous');
  const journal = storage.preUpgradeJournalPath();
  // Precreate with 0600 before SQLite opens it (not chmod after exposing bytes).
  const path = join(temp, 'pandanote.sqlite');
  const fd = openSync(path, 'wx', 0o600);
  closeSync(fd);
  await db.backup(path);
  // The online snapshot inherits WAL mode. Make this detached copy self-contained
  // before verification; otherwise even read-only SQLite may create WAL/SHM files.
  const snapshot = new Database(path, { fileMustExist: true });
  try {
    snapshot.pragma('trusted_schema=OFF');
    snapshot.pragma('synchronous=FULL');
    snapshot.pragma('journal_mode=DELETE');
  } finally {
    snapshot.close();
  }
  const complete = openSync(path, 'r+');
  try {
    fsyncSync(complete);
  } finally {
    closeSync(complete);
  }
  writePrivateJson(join(temp, 'manifest.json'), manifest);
  syncDirectory(temp);
  verifyCopy(temp);
  const hadPrevious = existsSync(current);
  if (hadPrevious) verifyCopy(current);
  writePrivateJson(journal, { version: 1, hadPrevious, phase: 'prepared' });
  options.onBoundary?.('prepared');
  if (hadPrevious) {
    renameSync(current, previous);
    syncDirectory(storage.root);
  }
  options.onBoundary?.('retained');
  renameSync(temp, current);
  syncDirectory(storage.root);
  options.onBoundary?.('published');
  writePrivateJson(journal, { version: 1, hadPrevious, phase: 'installed' });
  options.onBoundary?.('installed');
  recoverPreUpgrade(storage);
}
/** Stopped, single-instance LIVE startup path. Restore staging uses the synchronous
 * applyMigrations directly, with no backup side effects on destination storage. */
export async function upgradeDatabase(
  db: Database.Database,
  storage: PrivateStorage,
  options: UpgradeOptions,
  migrations: Migration[] = loadMigrations(),
): Promise<void> {
  if (db.inTransaction)
    throw new DatabaseUpgradeError(
      'Database upgrade requires a stopped application and no active transaction.',
    );
  recoverPreUpgrade(storage);
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0)
    throw new DatabaseUpgradeError(
      'Invalid migration timestamp; database unchanged.',
    );
  const state = migrationState(db, migrations, options);
  if (state.existing && state.pending) {
    const manifest = manifestSchema.parse({
      version: 1,
      fromSchemaVersion: state.fromVersion,
      toSchemaVersion: state.toVersion,
      appVersion: options.appVersion,
      createdAt: now,
    });
    try {
      await createCopy(db, storage, manifest, options);
    } catch (error) {
      if (error instanceof DatabaseUpgradeError) throw error;
      throw new DatabaseUpgradeError(
        'Pre-upgrade copy failed; database unchanged.',
        { cause: error }, // Server-only diagnostics; startup prints only message.
      );
    }
  }
  applyMigrations(db, migrations, { ...options, now });
}
