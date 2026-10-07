import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  chownSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { bootstrapContainer } from '../../scripts/container-bootstrap.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';
import { readSettings } from '../../src/lib/server/settings/repository.ts';
import { SCHEMA_VERSION } from '../../src/lib/server/db/migrations.ts';
import { ignoreLegacyEnvironment } from '../../src/lib/server/initialize.ts';
import { vi } from 'vitest';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import {
  PrivateStorage,
  newPrivateId,
} from '../../src/lib/server/storage/private-storage.ts';
import { JournalStore } from '../../src/lib/server/maintenance/journal.ts';
import { WriteCoordinator } from '../../src/lib/server/maintenance/coordinator.ts';
import { withPersistence } from '../helpers/persistence.ts';

it('bootstraps fresh native storage without a token or seeded account; restart preserves keys/settings', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-container-init-'));
  let persistence: Persistence | undefined;
  const options = { dataDir: root, production: true };
  try {
    await bootstrapContainer(options);
    const storage = new PrivateStorage(options);
    const keys = readFileSync(storage.keyPath);
    persistence = new Persistence(storage);
    expect(readSettings(persistence)).toEqual(DEFAULT_SETTINGS);
    expect(persistence.native.pragma('user_version', { simple: true })).toBe(
      SCHEMA_VERSION,
    );
    expect(persistence.native.prepare('SELECT * FROM account').all()).toEqual(
      [],
    );
    expect(
      persistence.native
        .prepare("SELECT name FROM sqlite_schema WHERE name='setup_tokens'")
        .all(),
    ).toEqual([]);
    persistence.write((tx) =>
      tx.run(
        "UPDATE app_settings SET value_json=json_set(value_json, '$.timezone', 'Asia/Tokyo')",
      ),
    );
    await persistence.close();
    persistence = undefined;
    await bootstrapContainer(options);
    expect(readFileSync(storage.keyPath)).toEqual(keys);
    expect(existsSync(storage.preUpgradeDirectory('current'))).toBe(false);
    persistence = new Persistence(storage);
    expect(readSettings(persistence).timezone).toBe('Asia/Tokyo');
  } finally {
    await persistence?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it('ignores and scrubs legacy variables with one value-free notice, including invalid values', () => {
  const env = {
    SETUP_TOKEN: 'synthetic-legacy-secret',
    TRUSTED_PROXY_IPS: '*invalid*',
  };
  const notice = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    ignoreLegacyEnvironment(env);
    ignoreLegacyEnvironment(env);
    expect(env).toEqual({});
    expect(notice).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(notice.mock.calls)).not.toContain(
      'synthetic-legacy-secret',
    );
    expect(JSON.stringify(notice.mock.calls)).not.toContain('*invalid*');
  } finally {
    notice.mockRestore();
  }
});

it('startup recovers a pending restore journal before opening/migrating the database', async () => {
  await withPersistence(async (p) => {
    const storage = p.storage;
    const store = new JournalStore(storage, new WriteCoordinator());
    store.put({
      version: 1,
      id: newPrivateId(),
      kind: 'restore',
      phase: 'prepared',
      stagedStateId: newPrivateId(),
      rollbackStateId: newPrivateId(),
      updatedAt: Date.now(),
    });
    await p.close();
    await bootstrapContainer({
      dataDir: storage.root,
      production: true,
    });
    expect(store.list()).toEqual([]);
  });
});

it.skipIf(process.platform !== 'linux' || process.getuid?.() !== 0)(
  'Linux initializer prepares a root-owned bind and permanently drops UID/GID and capabilities',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'pandanote-container-user-'));
    const data = join(root, 'data');
    try {
      chmodSync(root, 0o755);
      mkdirSync(data, { mode: 0o700 });
      writeFileSync(join(data, 'synthetic'), 'private bytes');
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { becomeContainerUser } from './scripts/container-user.ts';
           import { readFileSync } from 'node:fs';
           becomeContainerUser({uid:12345,gid:12346}, {dataDir:process.env.DATA_DIR, production:true});
           console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),groups:process.getgroups(),caps:readFileSync('/proc/self/status','utf8').match(/CapEff:\\s*(\\w+)/)[1]}));`,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            DATA_DIR: data,
            PUID: '12345',
            PGID: '12346',
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        uid: 12345,
        gid: 12346,
        groups: [12346],
        caps: '0000000000000000',
      });
      expect(lstatSync(data).uid).toBe(12345);
      expect(lstatSync(join(data, 'synthetic')).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform !== 'linux' || process.getuid?.() !== 0)(
  'Linux maintenance verifies ownership, drops privileges without walking/chowning, and rejects wrong owners',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'pandanote-maintenance-user-'));
    const data = join(root, 'data');
    try {
      chmodSync(root, 0o755);
      mkdirSync(data);
      const run = () =>
        spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `import { becomeContainerUser } from './scripts/container-user.ts';
         import { readFileSync } from 'node:fs';
         becomeContainerUser({uid:12345,gid:12346}, {dataDir:process.env.DATA_DIR, production:true}, true);
         console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),caps:readFileSync('/proc/self/status','utf8').match(/CapEff:\\s*(\\w+)/)[1]}));`,
          ],
          { encoding: 'utf8', env: { ...process.env, DATA_DIR: data } },
        );
      expect(run().status).toBe(1);
      expect(lstatSync(data).uid).toBe(0);
      chownSync(data, 12345, 12346);
      // A full walk would refuse this deliberately unsafe child. Maintenance must
      // not traverse or mutate it; the domain tool still validates paths it opens.
      symlinkSync('/outside/not-read', join(data, 'not-followed'));
      writeFileSync(join(data, 'untouched'), 'private');
      chmodSync(join(data, 'untouched'), 0o640);
      const result = run();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        uid: 12345,
        gid: 12346,
        caps: '0000000000000000',
      });
      expect(lstatSync(join(data, 'untouched')).uid).toBe(0);
      expect(lstatSync(join(data, 'untouched')).mode & 0o777).toBe(0o640);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform !== 'linux' || process.getuid?.() !== 0)(
  'Linux root preparation refuses symlinks and external hardlinks before changing owners',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'pandanote-unsafe-bind-'));
    const data = join(root, 'data');
    const outside = join(root, 'outside');
    try {
      mkdirSync(data);
      writeFileSync(outside, 'outside');
      for (const kind of ['symlink', 'hardlink']) {
        const link = join(data, 'unsafe');
        if (kind === 'symlink') symlinkSync(outside, link);
        else linkSync(outside, link);
        const result = spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `import { prepareContainerData } from './scripts/container-user.ts';
             prepareContainerData({uid:12345,gid:12346}, {dataDir:process.env.DATA_DIR, production:true});`,
          ],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              DATA_DIR: data,
              PUID: '12345',
              PGID: '12346',
            },
          },
        );
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(
          /Unsafe private data entry|external hard link/,
        );
        expect(lstatSync(outside).uid).toBe(0);
        rmSync(link);
      }
      expect(existsSync(outside)).toBe(true);
      const internal = join(data, 'internal');
      writeFileSync(internal, 'snapshot bytes');
      linkSync(internal, join(data, 'snapshot-link'));
      const safe = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { prepareContainerData } from './scripts/container-user.ts';
         prepareContainerData({uid:12345,gid:12346}, {dataDir:process.env.DATA_DIR, production:true});`,
        ],
        { encoding: 'utf8', env: { ...process.env, DATA_DIR: data } },
      );
      expect(safe.status, safe.stderr).toBe(0);
      expect(lstatSync(internal).uid).toBe(12345);
      expect(lstatSync(join(data, 'snapshot-link')).ino).toBe(
        lstatSync(internal).ino,
      );
      expect(lstatSync(outside).uid).toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
