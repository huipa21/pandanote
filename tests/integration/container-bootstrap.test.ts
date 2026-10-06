import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { tokenHash, newAuthToken } from '../../src/lib/server/auth/tokens.ts';
import { Persistence } from '../../src/lib/server/db/connection.ts';
import {
  PrivateStorage,
  newPrivateId,
} from '../../src/lib/server/storage/private-storage.ts';
import { JournalStore } from '../../src/lib/server/maintenance/journal.ts';
import { WriteCoordinator } from '../../src/lib/server/maintenance/coordinator.ts';
import { withPersistence } from '../helpers/persistence.ts';

it('bootstraps fresh native storage; repeated startup preserves keys/token expiry; setup consumes it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-container-init-'));
  let persistence: Persistence | undefined;
  const token = newAuthToken();
  const options = { dataDir: root, production: true };
  try {
    await bootstrapContainer(token, options);
    const storage = new PrivateStorage(options);
    const keys = readFileSync(storage.keyPath);
    persistence = new Persistence(storage);
    const pending = persistence.native
      .prepare('SELECT * FROM setup_tokens')
      .get();
    expect(pending).toMatchObject({ token_hash: tokenHash('setup', token) });
    expect(JSON.stringify(pending)).not.toContain(token);
    await persistence.close();
    persistence = undefined;
    await bootstrapContainer(token, options);
    expect(readFileSync(storage.keyPath)).toEqual(keys);
    persistence = new Persistence(storage);
    expect(
      persistence.native.prepare('SELECT * FROM setup_tokens').get(),
    ).toEqual(pending);
    const auth = new AuthService(persistence);
    await auth.setup(
      token,
      'synthetic password for container setup',
      '192.0.2.180',
    );
    const owner = persistence.native.prepare('SELECT * FROM account').get();
    await persistence.close();
    persistence = undefined;
    // Even stale/invalid configured tokens cannot reset an existing account.
    await bootstrapContainer(
      'invalid-but-ignored-for-existing-account',
      options,
    );
    await bootstrapContainer(undefined, options);
    persistence = new Persistence(storage);
    expect(persistence.native.prepare('SELECT * FROM account').get()).toEqual(
      owner,
    );
    expect(
      persistence.native.prepare('SELECT * FROM setup_tokens').all(),
    ).toEqual([]);
  } finally {
    await persistence?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it('environment token rotation is explicit, expiry is not renewed, and missing/invalid initial tokens fail closed', async () => {
  await withPersistence(async (p) => {
    let now = 1_800_000_000_000;
    const auth = new AuthService(p, () => now);
    expect(() => auth.bootstrapSetupToken(undefined)).toThrow(/SETUP_TOKEN/);
    expect(() => auth.bootstrapSetupToken('short')).toThrow();
    const first = newAuthToken();
    auth.bootstrapSetupToken(first);
    now += 60 * 60_000;
    auth.bootstrapSetupToken(first);
    await expect(
      auth.setup(first, 'synthetic password only', '192.0.2.181'),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    const second = newAuthToken();
    auth.bootstrapSetupToken(second);
    await expect(
      auth.setup(first, 'synthetic password only', '192.0.2.182'),
    ).rejects.toMatchObject({ code: 'unauthorized' });
    expect(
      p.native.prepare('SELECT token_hash FROM setup_tokens').get(),
    ).toEqual({ token_hash: tokenHash('setup', second) });
    auth.bootstrapSetupToken(undefined); // Existing CLI/environment token is retained.
    await auth.setup(second, 'synthetic password only', '192.0.2.183');
  });
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
    await bootstrapContainer(newAuthToken(), {
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
