import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { beforeAll, expect, it } from 'vitest';
import { initializeApplication } from '../../src/lib/server/initialize.ts';
import {
  applyMigrations,
  loadMigrations,
  HISTORY_MISMATCH_DATABASE_MESSAGE,
  SCHEMA_VERSION,
} from '../../src/lib/server/db/migrations.ts';
import { connectDatabase } from '../../src/lib/server/db/connection.ts';
import { PrivateStorage } from '../../src/lib/server/storage/private-storage.ts';
import { startupArgs } from '../helpers/startup.ts';

beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    [resolve('node_modules/vite/bin/vite.js'), 'build'],
    {
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        TEST: 'false',
        VITEST: 'false',
      },
    },
  );
  expect(result.status, result.stderr).toBe(0);
}, 90_000);

it('local data defaults to ./data; shared startup applies SQL/data steps with a private pre-upgrade copy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-default-startup-'));
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'development' };
    delete env.DATA_DIR;
    symlinkSync(resolve('migrations'), join(root, 'migrations'), 'junction');
    const code = startupArgs[2].replace(
      './src/lib/server/initialize.ts',
      new URL('../../src/lib/server/initialize.ts', import.meta.url).href,
    );
    const run = () =>
      spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        cwd: root,
        env,
        encoding: 'utf8',
      });
    expect(run().status).toBe(0);
    const keyPath = join(root, 'data/private/key-material.json');
    const keys = readFileSync(keyPath);
    expect(run().status).toBe(0);
    expect(readFileSync(keyPath)).toEqual(keys);
    expect(existsSync(join(root, 'data/pre-upgrade'))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const oldRoot = mkdtempSync(join(tmpdir(), 'pandanote-startup-upgrade-'));
  try {
    const storage = new PrivateStorage({ dataDir: oldRoot });
    storage.initializeKeys();
    const db = connectDatabase(storage.databasePath);
    applyMigrations(db, loadMigrations().slice(0, 1));
    db.close();
    await expect(
      initializeApplication({
        dataDir: oldRoot,
        upgrade: {
          reserveBytes: 0,
          dataSteps: new Map([
            [
              2,
              {
                name: 'rebuild-search-v1',
                run: () => {
                  throw new Error('synthetic-private-data-never-logged');
                },
              },
            ],
          ]),
        },
      }),
    ).rejects.toThrow('Database upgrade failed at migration 2');
    const unchanged = connectDatabase(storage.databasePath, true);
    try {
      expect(unchanged.pragma('user_version', { simple: true })).toBe(1);
    } finally {
      unchanged.close();
    }
    await initializeApplication({
      dataDir: oldRoot,
      upgrade: { reserveBytes: 0 },
    });
    const copy = new Database(join(oldRoot, 'pre-upgrade/pandanote.sqlite'), {
      readonly: true,
    });
    try {
      expect(copy.pragma('user_version', { simple: true })).toBe(1);
    } finally {
      copy.close();
    }
    const live = connectDatabase(storage.databasePath, true);
    try {
      expect(live.pragma('user_version', { simple: true })).toBe(
        SCHEMA_VERSION,
      );
      expect(
        live
          .prepare(
            'SELECT data_step FROM __pandanote_migrations WHERE version=2',
          )
          .get(),
      ).toEqual({ data_step: 'rebuild-search-v1' });
    } finally {
      live.close();
    }
  } finally {
    rmSync(oldRoot, { recursive: true, force: true });
  }
});

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}
it('built npm-start path defaults local origin/storage, ignores legacy values once, and restarts without resetting data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-startup-http-'));
  try {
    for (const name of ['build', 'migrations'])
      symlinkSync(resolve(name), join(root, name), 'junction');
    let keys: Buffer | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const port = await unusedPort();
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: String(port),
        SETUP_TOKEN: 'synthetic-secret-not-printed',
        TRUSTED_PROXY_IPS: 'invalid-old-value',
        ADDRESS_HEADER: '',
        HOST_HEADER: '',
        PROTOCOL_HEADER: '',
        PORT_HEADER: '',
      };
      delete env.ORIGIN;
      delete env.DATA_DIR;
      const child = spawn(process.execPath, [resolve('build/index.js')], {
        cwd: root,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exit = new Promise<void>((done) =>
        child.once('exit', () => done()),
      );
      try {
        let response: Response | undefined;
        for (let i = 0; i < 100 && !response; i++) {
          try {
            response = await fetch(`http://127.0.0.1:${port}/health`, {
              signal: AbortSignal.timeout(500),
            });
          } catch {
            await delay(50);
          }
        }
        expect(response?.status, output).toBe(200);
        expect(await response?.json()).toEqual({ status: 'ok' });
        const setup = await fetch(`http://127.0.0.1:${port}/`, {
          redirect: 'manual',
        });
        expect(setup.status).toBe(303);
        expect(setup.headers.get('location')).toBe('/setup');
        expect(
          output.match(/Legacy SETUP_TOKEN\/TRUSTED_PROXY_IPS/g),
        ).toHaveLength(1);
        expect(output).not.toContain(env.SETUP_TOKEN!);
        expect(output).not.toContain(env.TRUSTED_PROXY_IPS!);
        // POST with the documented local origin reaches auth, not the CSRF 403.
        const invalidLogin = await fetch(
          `http://127.0.0.1:${port}/api/auth/login`,
          {
            method: 'POST',
            headers: {
              origin: 'http://localhost:3000',
              'content-type': 'application/json',
            },
            body: '{}',
          },
        );
        expect(invalidLogin.status).toBe(409); // Fresh deployment requires setup.
        const bytes = readFileSync(
          join(root, 'data/private/key-material.json'),
        );
        if (keys) expect(bytes).toEqual(keys);
        keys = bytes;
        expect(existsSync(join(root, 'data/pre-upgrade'))).toBe(false);
      } finally {
        child.kill('SIGTERM');
        await Promise.race([
          exit,
          delay(5000).then(() => {
            child.kill('SIGKILL');
            throw new Error('Startup server failed to stop');
          }),
        ]);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 10 });
  }
}, 30_000);

it('real Vite dev startup initializes before responding and uses the dev origin default', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-dev-startup-'));
  const port = await unusedPort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    DATA_DIR: root,
  };
  delete env.ORIGIN;
  const child = spawn(
    process.execPath,
    [
      resolve('node_modules/vite/bin/vite.js'),
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<void>((done) => child.once('exit', () => done()));
  try {
    let response: Response | undefined;
    for (let i = 0; i < 100 && !response; i++) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        await delay(50);
      }
    }
    expect(response?.status, output).toBe(200);
    expect(existsSync(join(root, 'private/key-material.json'))).toBe(true);
    const bad = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(bad.status).toBe(409); // Setup gate, not CSRF 403: dev origin is 5173.
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      exited,
      delay(5000).then(() => {
        child.kill('SIGKILL');
        throw new Error('Dev server failed to stop');
      }),
    ]);
    rmSync(root, { recursive: true, force: true, maxRetries: 10 });
  }
}, 30_000);

it('incompatible baseline startup gives safe recovery instructions without changing the ledger, notes or keys', () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-incompatible-startup-'));
  try {
    const storage = new PrivateStorage({ dataDir: root });
    storage.initializeKeys();
    const keys = readFileSync(join(root, 'private/key-material.json'));
    const db = connectDatabase(storage.databasePath);
    applyMigrations(db);
    db.prepare(
      "INSERT INTO notes (id, body_markdown, status, timeline_at, created_at, updated_at) VALUES (?, ?, 'published', 1, 1, 1)",
    ).run(
      '12345678-1234-4123-8123-123456789012',
      'synthetic-private-note-never-logged',
    );
    db.prepare(
      'UPDATE __pandanote_migrations SET hash = ? WHERE version = 1',
    ).run('0'.repeat(64));
    const ledger = db
      .prepare('SELECT * FROM __pandanote_migrations ORDER BY version')
      .all();
    const notes = db.prepare('SELECT * FROM notes').all();
    db.close();

    const refused = spawnSync(process.execPath, ['build/index.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATA_DIR: root,
        ORIGIN: 'https://notes.example.test',
        HOST: '127.0.0.1',
        PORT: '0',
      },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(HISTORY_MISMATCH_DATABASE_MESSAGE);
    expect(refused.stdout).not.toContain('Listening');
    expect(refused.stderr).not.toContain(root);
    expect(refused.stderr).not.toContain('synthetic-private-note-never-logged');
    expect(refused.stderr).not.toContain('0'.repeat(64));
    expect(readFileSync(join(root, 'private/key-material.json'))).toEqual(keys);
    expect(existsSync(join(root, 'pre-upgrade'))).toBe(false);
    const inspector = connectDatabase(storage.databasePath, true);
    try {
      expect(inspector.pragma('user_version', { simple: true })).toBe(
        SCHEMA_VERSION,
      );
      expect(
        inspector
          .prepare('SELECT * FROM __pandanote_migrations ORDER BY version')
          .all(),
      ).toEqual(ledger);
      expect(inspector.prepare('SELECT * FROM notes').all()).toEqual(notes);
      expect(inspector.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally {
      inspector.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('TRUSTED_PROXIES: invalid values refuse startup; a valid list logs only its entry count', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-trusted-proxies-'));
  try {
    const base: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      ORIGIN: 'https://notes.example.test',
      DATA_DIR: root,
      HOST: '127.0.0.1',
    };
    for (const value of ['*', '10.0.0.0/33', 'none, 10.0.0.1']) {
      const port = await unusedPort();
      const refused = spawnSync(process.execPath, ['build/index.js'], {
        env: { ...base, PORT: String(port), TRUSTED_PROXIES: value },
        encoding: 'utf8',
        timeout: 10_000,
      });
      expect(refused.status, value).toBe(1);
      expect(refused.stderr, value).toContain(
        'TRUSTED_PROXIES must be none or a comma-separated list of IP addresses/CIDRs',
      );
      expect(refused.stdout, value).not.toContain('Listening');
      expect(existsSync(join(root, 'db')), value).toBe(false);
    }
    const port = await unusedPort();
    const listed = '10.0.5.2,172.18.0.0/16';
    const child = spawn(process.execPath, ['build/index.js'], {
      env: { ...base, PORT: String(port), TRUSTED_PROXIES: listed },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    const exit = new Promise<void>((done) => child.once('exit', () => done()));
    try {
      let response: Response | undefined;
      for (let i = 0; i < 100 && !response; i++) {
        try {
          response = await fetch(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(500),
          });
        } catch {
          await delay(50);
        }
      }
      expect(response?.status, output).toBe(200);
      expect(output).toContain(
        'Trusting X-Forwarded-For only from 2 configured proxy entries.',
      );
      expect(output).not.toContain('10.0.5.2');
      expect(output).not.toContain('172.18.0.0');
    } finally {
      child.kill();
      await exit;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('production missing origin and failed initialization never listen, and logs disclose no paths or native content', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-refused-startup-'));
  try {
    const port = await unusedPort();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      DATA_DIR: root,
      HOST: '127.0.0.1',
      PORT: String(port),
    };
    delete env.ORIGIN;
    const missing = spawnSync(process.execPath, ['build/index.js'], {
      env,
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('ORIGIN must be set in production');
    expect(missing.stdout).not.toContain('Listening');
    expect(existsSync(join(root, 'db'))).toBe(false);
    mkdirSync(join(root, 'private'));
    writeFileSync(
      join(root, 'private/key-material.json'),
      'synthetic-private-invalid-key',
    );
    const badKey = spawnSync(process.execPath, ['build/index.js'], {
      env: { ...env, ORIGIN: 'https://notes.example.test' },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(badKey.status).toBe(1);
    expect(badKey.stderr).toContain('PandaNote initialization failed');
    expect(badKey.stdout).not.toContain('Listening');
    expect(badKey.stderr).not.toContain('synthetic-private-invalid-key');
    expect(badKey.stderr).not.toContain(root);
    expect(existsSync(join(root, 'db/pandanote.sqlite'))).toBe(false);
    await expect(
      fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(1000),
      }),
    ).rejects.toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
