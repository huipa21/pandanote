import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import {
  PrivateStorage,
  newPrivateId,
  writePrivateJson,
} from '../../src/lib/server/storage/private-storage.ts';
import { WriteCoordinator } from '../../src/lib/server/maintenance/coordinator.ts';
import {
  JournalStore,
  type FilesystemJournal,
} from '../../src/lib/server/maintenance/journal.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import { withPersistence } from '../helpers/persistence.ts';

it('requires explicit private production paths, refuses source/public/symlink roots and validates all generated paths', () => {
  const temp = mkdtempSync(join(tmpdir(), 'pandanote-private-'));
  try {
    expect(
      () => new PrivateStorage({ production: true, dataDir: 'relative' }),
    ).toThrow(/absolute/);
    for (const path of ['static/data', 'src/data', 'build/data', '.'])
      expect(
        () => new PrivateStorage({ dataDir: path, production: false }),
      ).toThrow(/outside/);
    const real = join(temp, 'real');
    mkdirSync(real);
    const link = join(temp, 'link');
    symlinkSync(real, link, 'junction');
    expect(() => new PrivateStorage({ dataDir: link })).toThrow(/symbolic/);
    const storage = new PrivateStorage({ dataDir: real, production: true });
    const id = newPrivateId();
    expect(storage.attachmentPath(id, 'display.webp')).toBe(
      join(real, 'files', id, 'display.webp'),
    );
    expect(storage.backupPath(id)).toBe(join(real, 'backups', `${id}.pnb`));
    expect(storage.stagingDirectory('uploads', id)).toBe(
      join(real, 'staging', 'uploads', id),
    );
    for (const value of [
      '../escape',
      'C:\\private',
      'invalid',
      id.toUpperCase(),
    ])
      expect(() => storage.attachmentPath(value, 'attachment.bin')).toThrow();
    symlinkSync(real, join(real, 'files', id), 'junction');
    expect(() => storage.attachmentPath(id, 'attachment.bin')).toThrow(
      /symbolic/,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
it('creates random portable key material once, protects POSIX permissions and refuses lost/corrupt keys', async () => {
  await withPersistence((p, root) => {
    const original = p.storage.readKeys();
    const bytes = readFileSync(p.storage.keyPath);
    expect(Buffer.from(original.totpEncryptionKey, 'base64')).toHaveLength(32);
    expect(p.storage.initializeKeys()).toEqual(original);
    expect(readFileSync(p.storage.keyPath)).toEqual(bytes);
    if (process.platform !== 'win32') {
      for (const path of [
        root,
        join(root, 'db'),
        join(root, 'private'),
        join(root, 'files'),
        join(root, 'staging'),
        join(root, 'backups'),
      ])
        expect(statSync(path).mode & 0o777).toBe(0o700);
      for (const path of [
        p.storage.keyPath,
        p.storage.databasePath,
        `${p.storage.databasePath}-wal`,
        `${p.storage.databasePath}-shm`,
      ])
        expect(statSync(path).mode & 0o777).toBe(0o600);
    }
    unlinkSync(p.storage.keyPath);
    expect(() => p.storage.initializeKeys()).toThrow(/missing/);
    writeFileSync(p.storage.keyPath, '{"version":2}');
    expect(() => p.storage.readKeys()).toThrow();
    writePrivateJson(p.storage.keyPath, original);
  });
});
it('durably replaces bounded validated journals, supports exclusive leases and blocks startup pending recovery', async () => {
  await withPersistence(async (p) => {
    const store = new JournalStore(p.storage, p.coordinator);
    const journal: FilesystemJournal = {
      version: 1,
      id: newPrivateId(),
      kind: 'restore',
      phase: 'prepared',
      stagedStateId: newPrivateId(),
      rollbackStateId: newPrivateId(),
      updatedAt: Date.now(),
    };
    expect(store.read(journal.id)).toBeNull();
    store.put(journal);
    expect(store.list()).toEqual([journal]);
    expect(() => new Persistence(p.storage)).toThrow(/recovery/);
    expect(() =>
      store.put({ ...journal, stagedStateId: '../escape' }),
    ).toThrow();
    await p.coordinator.exclusive(async (lease) => {
      expect(() => store.put(journal)).toThrow(/Maintenance/);
      store.put({ ...journal, phase: 'old-state-retained' }, lease);
      expect(store.read(journal.id)?.phase).toBe('old-state-retained');
      store.remove(journal.id, lease);
    });
    expect(store.list()).toEqual([]);
    expect(readdirSync(join(p.storage.root, 'private', 'journals'))).toEqual(
      [],
    );
    const other = new JournalStore(p.storage, new WriteCoordinator());
    writeFileSync(p.storage.journalPath(journal.id), 'x'.repeat(4097));
    expect(() => other.read(journal.id)).toThrow(/large/);
    store.remove(journal.id);
  });
});
it('runs the real explicit migration CLI twice without demo data or rotating keys', () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-cli-'));
  try {
    const env = { ...process.env, DATA_DIR: root, NODE_ENV: 'production' };
    const run = () =>
      execFileSync(process.execPath, ['scripts/migrate.ts'], {
        env,
        encoding: 'utf8',
      });
    expect(run()).toContain('No account was created');
    const keyPath = join(root, 'private', 'key-material.json');
    const before = readFileSync(keyPath);
    expect(run()).toContain('ready');
    expect(readFileSync(keyPath)).toEqual(before);
    const db = new Database(join(root, 'db', 'pandanote.sqlite'), {
      readonly: true,
    });
    try {
      expect(db.prepare('SELECT count(*) AS n FROM notes').get()).toEqual({
        n: 0,
      });
      expect(db.prepare('SELECT count(*) AS n FROM account').get()).toEqual({
        n: 0,
      });
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      db.close();
    }
    expect(existsSync(join(root, 'private', 'key-material.json'))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
