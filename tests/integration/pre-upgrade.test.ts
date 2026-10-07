import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { connectDatabase } from '../../src/lib/server/db/connection.ts';
import {
  applyMigrations,
  loadMigrations,
  SCHEMA_VERSION,
  type Migration,
  NEWER_DATABASE_MESSAGE,
} from '../../src/lib/server/db/migrations.ts';
import {
  recoverPreUpgrade,
  upgradeDatabase,
  type UpgradeBoundary,
  type UpgradeOptions,
} from '../../src/lib/server/db/pre-upgrade.ts';
import { PrivateStorage } from '../../src/lib/server/storage/private-storage.ts';
import { startupAppVersion } from '../../src/lib/server/db/upgrade-version.ts';

const migrations: Migration[] = [
  {
    version: 1,
    name: '0000_synthetic',
    hash: 'a'.repeat(64),
    statements: [
      'CREATE TABLE sample (id INTEGER PRIMARY KEY, value TEXT NOT NULL)',
      "INSERT INTO sample VALUES (1, 'before')",
    ],
  },
  {
    version: 2,
    name: '0001_synthetic',
    hash: 'b'.repeat(64),
    statements: ['ALTER TABLE sample ADD COLUMN migrated_at INTEGER'],
  },
  {
    version: 3,
    name: '0002_synthetic',
    hash: 'c'.repeat(64),
    statements: ['CREATE INDEX sample_value ON sample(value)'],
  },
];
const options: UpgradeOptions = {
  appVersion: '261006-12',
  now: 123,
  reserveBytes: 0,
  dataSteps: new Map([
    [
      2,
      {
        name: 'sample-v1',
        run: (db, ctx) => {
          db.prepare('UPDATE sample SET migrated_at=?').run(ctx.now);
        },
      },
    ],
  ]),
};
async function fixture(
  test: (db: Database.Database, storage: PrivateStorage) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-pre-upgrade-'));
  const storage = new PrivateStorage({ dataDir: root });
  storage.initializeKeys();
  const db = connectDatabase(storage.databasePath);
  try {
    await test(db, storage);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
}
function inspectCopy(storage: PrivateStorage, version: number): void {
  const folder = storage.preUpgradeDirectory('current');
  expect(readdirSync(folder).sort()).toEqual([
    'manifest.json',
    'pandanote.sqlite',
  ]);
  const copy = new Database(join(folder, 'pandanote.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    expect(copy.pragma('user_version', { simple: true })).toBe(version);
    expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(copy.pragma('foreign_key_check')).toEqual([]);
  } finally {
    copy.close();
  }
  if (process.platform !== 'win32') {
    expect(statSync(folder).mode & 0o777).toBe(0o700);
    for (const file of ['manifest.json', 'pandanote.sqlite'])
      expect(statSync(join(folder, file)).mode & 0o777).toBe(0o600);
  }
  expect(existsSync(storage.preUpgradeDirectory('previous'))).toBe(false);
  expect(existsSync(storage.preUpgradeDirectory('temporary'))).toBe(false);
  expect(existsSync(storage.preUpgradeJournalPath())).toBe(false);
}
it('skips fresh/current databases; backs up WAL content before pending SQL + data, then replaces the latest copy', async () => {
  await fixture(async (db, storage) => {
    await upgradeDatabase(db, storage, options, migrations.slice(0, 1));
    await upgradeDatabase(db, storage, options, migrations.slice(0, 1));
    expect(existsSync(storage.preUpgradeDirectory('current'))).toBe(false);
    const key = readFileSync(storage.keyPath);
    db.pragma('wal_autocheckpoint=0');
    const source = 'synthetic WAL content '.repeat(10_000);
    db.prepare('UPDATE sample SET value=?').run(source);
    const ledger = db.prepare('SELECT * FROM __pandanote_migrations').all();
    await upgradeDatabase(db, storage, options, migrations.slice(0, 2));
    inspectCopy(storage, 1);
    const copy = new Database(
      join(storage.preUpgradeDirectory('current'), 'pandanote.sqlite'),
      { readonly: true },
    );
    try {
      expect(copy.prepare('SELECT value FROM sample').get()).toEqual({
        value: source,
      });
      expect(
        copy.prepare('SELECT * FROM __pandanote_migrations').all(),
      ).toEqual(ledger);
      expect(copy.pragma('table_info(sample)')).toHaveLength(2);
    } finally {
      copy.close();
    }
    expect(db.prepare('SELECT migrated_at FROM sample').get()).toEqual({
      migrated_at: 123,
    });
    expect(
      JSON.parse(
        readFileSync(
          join(storage.preUpgradeDirectory('current'), 'manifest.json'),
          'utf8',
        ),
      ),
    ).toEqual({
      version: 1,
      fromSchemaVersion: 1,
      toSchemaVersion: 2,
      appVersion: '261006-12',
      createdAt: 123,
    });
    const unchanged = readFileSync(
      join(storage.preUpgradeDirectory('current'), 'pandanote.sqlite'),
    );
    await upgradeDatabase(db, storage, options, migrations.slice(0, 2));
    expect(
      readFileSync(
        join(storage.preUpgradeDirectory('current'), 'pandanote.sqlite'),
      ),
    ).toEqual(unchanged);
    await upgradeDatabase(db, storage, { ...options, now: 456 }, migrations);
    inspectCopy(storage, 2);
    expect(db.pragma('user_version', { simple: true })).toBe(3);
    expect(readFileSync(storage.keyPath)).toEqual(key);
  });
});
it('refuses insufficient space before snapshot/migration; estimates WAL pages and preserves the previous copy', async () => {
  await fixture(async (db, storage) => {
    applyMigrations(db, migrations.slice(0, 1), options);
    await upgradeDatabase(db, storage, options, migrations.slice(0, 2));
    const old = readFileSync(
      join(storage.preUpgradeDirectory('current'), 'pandanote.sqlite'),
    );
    db.prepare('UPDATE sample SET value=?').run(
      'wal-only growth'.repeat(50_000),
    );
    const before = db.prepare('SELECT * FROM __pandanote_migrations').all();
    const needed =
      Math.ceil(
        Number(db.pragma('page_count', { simple: true })) *
          Number(db.pragma('page_size', { simple: true })) *
          1.1,
      ) +
      4096 +
      1024;
    await expect(
      upgradeDatabase(
        db,
        storage,
        {
          ...options,
          reserveBytes: 1024,
          inspectDisk: () => ({ available: needed - 1, total: needed * 10 }),
        },
        migrations,
      ),
    ).rejects.toThrow(
      `need ${needed} bytes including disk reserve; ${needed - 1} bytes available`,
    );
    expect(db.prepare('SELECT * FROM __pandanote_migrations').all()).toEqual(
      before,
    );
    expect(db.pragma('user_version', { simple: true })).toBe(2);
    expect(
      readFileSync(
        join(storage.preUpgradeDirectory('current'), 'pandanote.sqlite'),
      ),
    ).toEqual(old);
    expect(existsSync(storage.preUpgradeDirectory('temporary'))).toBe(false);
  });
});
it('keeps a valid old-schema snapshot when migration fails; refuses downgrade/hash drift without replacing it', async () => {
  await fixture(async (db, storage) => {
    applyMigrations(db, migrations.slice(0, 1), options);
    const failing = [
      migrations[0],
      {
        ...migrations[1],
        statements: [...migrations[1].statements, 'invalid sql'],
      },
    ];
    await expect(
      upgradeDatabase(db, storage, options, failing),
    ).rejects.toThrow(
      'Database upgrade failed at migration 2 (0001_synthetic); data unchanged.',
    );
    inspectCopy(storage, 1);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    await upgradeDatabase(db, storage, options, migrations);
    const before = readFileSync(
      join(storage.preUpgradeDirectory('current'), 'pandanote.sqlite'),
    );
    await expect(
      upgradeDatabase(db, storage, options, migrations.slice(0, 1)),
    ).rejects.toThrow(NEWER_DATABASE_MESSAGE);
    await expect(
      upgradeDatabase(db, storage, options, [
        { ...migrations[0], hash: '0'.repeat(64) },
        ...migrations.slice(1),
      ]),
    ).rejects.toThrow(/hash/);
    expect(
      readFileSync(
        join(storage.preUpgradeDirectory('current'), 'pandanote.sqlite'),
      ),
    ).toEqual(before);
  });
});
it.each([
  'prepared',
  'retained',
  'published',
  'installed',
] as UpgradeBoundary[])(
  'recovers a killed process at %s with a complete previous or committed new copy',
  async (boundary) => {
    await fixture(async (db, storage) => {
      applyMigrations(db, migrations.slice(0, 1), options);
      await upgradeDatabase(db, storage, options, migrations.slice(0, 2));
      const script = `
      import { connectDatabase } from './src/lib/server/db/connection.ts';
      import { upgradeDatabase } from './src/lib/server/db/pre-upgrade.ts';
      import { PrivateStorage } from './src/lib/server/storage/private-storage.ts';
      const [root, boundary, history] = process.argv.slice(1);
      const storage = new PrivateStorage({ dataDir: root });
      const db = connectDatabase(storage.databasePath);
      await upgradeDatabase(db, storage, { appVersion:'Development', reserveBytes:0, dataSteps:new Map([[2,{name:'sample-v1',run:()=>{}}]]), onBoundary: step => { if(step === boundary) process.kill(process.pid, 'SIGKILL'); } }, JSON.parse(history));
    `;
      expect(() =>
        execFileSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            script,
            storage.root,
            boundary,
            JSON.stringify(migrations),
          ],
          { stdio: 'pipe', timeout: 30_000 },
        ),
      ).toThrow();
      expect(existsSync(storage.preUpgradeJournalPath())).toBe(true);
      recoverPreUpgrade(storage);
      inspectCopy(storage, boundary === 'installed' ? 2 : 1);
      recoverPreUpgrade(storage); // Idempotent startup recovery.
      expect(db.pragma('user_version', { simple: true })).toBe(2);
      await upgradeDatabase(db, storage, options, migrations);
      inspectCopy(storage, 2);
    });
  },
);
it('recovers first-copy interruption and rejects unsafe private upgrade paths without touching live data', async () => {
  await fixture(async (db, storage) => {
    applyMigrations(db, migrations.slice(0, 1), options);
    await expect(
      upgradeDatabase(
        db,
        storage,
        {
          ...options,
          onBoundary: (step) => {
            if (step === 'published') throw new Error('injected');
          },
        },
        migrations.slice(0, 2),
      ),
    ).rejects.toThrow(/copy failed/);
    recoverPreUpgrade(storage);
    expect(existsSync(storage.preUpgradeDirectory('current'))).toBe(false);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    symlinkSync(
      join(storage.root, 'db'),
      storage.preUpgradeDirectory('temporary'),
      'junction',
    );
    await expect(
      upgradeDatabase(db, storage, options, migrations),
    ).rejects.toThrow(/symbolic/);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });
});
it('the actual stopped-app CLI snapshots a known older schema before upgrade and refuses low space with a safe log', async () => {
  await fixture(async (db, storage) => {
    const trusted = loadMigrations();
    applyMigrations(db, trusted.slice(0, 1));
    const env = {
      ...process.env,
      DATA_DIR: storage.root,
      NODE_ENV: 'production',
      DISK_RESERVE_BYTES: String(2 ** 50),
    };
    let output = '';
    try {
      execFileSync(process.execPath, ['scripts/migrate.ts'], {
        env,
        encoding: 'utf8',
        timeout: 30_000,
      });
    } catch (error) {
      output = String((error as { stderr: unknown }).stderr);
    }
    expect(output).toContain(
      'Not enough free space for the pre-upgrade copy: need',
    );
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    expect(existsSync(storage.preUpgradeDirectory('current'))).toBe(false);
    const success = execFileSync(process.execPath, ['scripts/migrate.ts'], {
      env: { ...env, DISK_RESERVE_BYTES: '0' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(success).toContain('No account was created');
    inspectCopy(storage, 1);
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
  });
});
it('cleans only safe interrupted staging and refuses malformed recovery without deleting retained copies', async () => {
  await fixture(async (db, storage) => {
    applyMigrations(db, migrations.slice(0, 1), options);
    const temp = storage.preUpgradeDirectory('temporary', true);
    writeFileSync(join(temp, 'pandanote.sqlite'), 'interrupted');
    writeFileSync(join(temp, 'pandanote.sqlite-journal'), 'interrupted');
    writeFileSync(
      join(temp, `.${randomUUID()}.tmp`),
      'interrupted manifest write',
    );
    recoverPreUpgrade(storage);
    expect(existsSync(temp)).toBe(false);
    await upgradeDatabase(db, storage, options, migrations.slice(0, 2));
    const current = join(
      storage.preUpgradeDirectory('current'),
      'pandanote.sqlite',
    );
    const before = readFileSync(current);
    writeFileSync(storage.preUpgradeJournalPath(), '{broken');
    expect(() => recoverPreUpgrade(storage)).toThrow();
    expect(readFileSync(current)).toEqual(before);
    expect(db.pragma('user_version', { simple: true })).toBe(2);
  });
});
it('reads immutable release metadata for startup copies, not runtime metadata environment', () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-upgrade-version-'));
  const path = join(root, 'build-info.json');
  try {
    expect(startupAppVersion(path)).toBe('Development');
    writeFileSync(
      path,
      JSON.stringify({
        kind: 'release',
        version: '261006-12',
        commit: 'b'.repeat(40),
        committedAt: '2026-10-06T12:34:56.000Z',
      }),
    );
    expect(startupAppVersion(path)).toBe('261006-12');
    writeFileSync(
      path,
      JSON.stringify({
        kind: 'release',
        version: 'invalid',
        commit: 'b'.repeat(40),
        committedAt: '2026-10-06T12:34:56.000Z',
      }),
    );
    expect(() => startupAppVersion(path)).toThrow(/Invalid release/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
