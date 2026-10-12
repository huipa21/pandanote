import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { generateSync } from 'otplib';
import Database from 'better-sqlite3';
import { beforeAll, expect, it } from 'vitest';
import { withPersistence, seedAttachment } from '../helpers/persistence.ts';
import { createFixtureAccount } from '../helpers/auth.ts';
import { terminal } from '../helpers/terminal.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';
import { NoteService } from '../../src/lib/server/notes/service.ts';
import { randomUUID } from 'node:crypto';
import { JournalStore } from '../../src/lib/server/maintenance/journal.ts';
const linux = process.platform === 'linux';
const password = 'synthetic-reset-original';
const replacement = '密碼123456';
const envFor = (root: string, origin = 'http://localhost:3000') => ({
  ...process.env,
  DATA_DIR: root,
  ORIGIN: origin,
  NODE_ENV: 'production',
  ADDRESS_HEADER: '',
  HOST_HEADER: '',
  PROTOCOL_HEADER: '',
  PORT_HEADER: '',
});

beforeAll(() => {
  if (!linux) return;
  const build = spawnSync(
    process.execPath,
    [resolve('node_modules/vite/bin/vite.js'), 'build'],
    {
      encoding: 'utf8',
      timeout: 60000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        TEST: 'false',
        VITEST: 'false',
      },
    },
  );
  expect(build.status, build.stderr).toBe(0);
}, 90000);

it('refuses arguments and piped/no-TTY input without printing credentials or changing account state', async () => {
  await withPersistence(async (p, root) => {
    await createFixtureAccount(new AuthService(p), password, '192.0.2.110');
    const before = p.native.prepare('SELECT * FROM account').get();
    for (const args of [
      [],
      ['--confirm-reset-security'],
      ['secret-argument'],
    ]) {
      const child = spawnSync(
        process.execPath,
        ['scripts/reset-password.ts', ...args],
        {
          env: envFor(root),
          input: 'piped-secret\n',
          encoding: 'utf8',
        },
      );
      expect(child.status).toBe(1);
      expect(child.stderr).toContain('interactive terminal');
      expect(child.stdout + child.stderr).not.toContain('piped-secret');
      expect(child.stdout + child.stderr).not.toContain('secret-argument');
      expect(p.native.prepare('SELECT * FROM account').get()).toEqual(before);
    }
  });
});

it.skipIf(!linux)(
  'PTY reset while HTTP server runs: retries validation/mismatch without echo, revokes sessions/challenges immediately, disables MFA and preserves notes/files/settings',
  async () => {
    await withPersistence(async (p, root) => {
      const auth = new AuthService(p);
      const initial = await createFixtureAccount(auth, password, '192.0.2.111');
      const identity = auth.authenticate(initial.token)!;
      const grant = await auth.freshAuth(
        identity,
        'mfa-enroll',
        password,
        undefined,
        '192.0.2.111',
      );
      const enrollment = auth.startEnrollment(identity, grant.token);
      const enabled = auth.confirmEnrollment(
        identity,
        enrollment.challenge,
        generateSync({ secret: enrollment.secret, epoch: Date.now() / 1000 }),
        '192.0.2.111',
      );
      const current = auth.authenticate(enabled.credential.token)!;
      new NoteService(p).mutate(current, {
        action: 'create',
        mutationId: randomUUID(),
        content: {
          bodyMarkdown: 'reset survivor #Work',
          timelineAt: null,
          location: null,
          attachmentIds: [],
        },
      });
      const note = p.native.prepare('SELECT * FROM notes').all();
      const settings = p.native.prepare('SELECT * FROM app_settings').all();
      const oldRevision = (
        p.native.prepare('SELECT security_revision FROM account').get() as {
          security_revision: number;
        }
      ).security_revision;
      const fileId = seedAttachment(p);
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(root, 'files', fileId));
      writeFileSync(join(root, 'files', fileId, 'attachment.bin'), 'file');
      const keys = readFileSync(p.storage.keyPath);
      await p.close();
      const listener = createServer();
      await new Promise<void>((done) => listener.listen(0, '127.0.0.1', done));
      const port = (listener.address() as { port: number }).port;
      await new Promise<void>((done) => listener.close(() => done()));
      const origin = `http://127.0.0.1:${port}`;
      const env = {
        ...envFor(root, origin),
        HOST: '127.0.0.1',
        PORT: String(port),
      };
      const server = spawn(process.execPath, ['build/index.js'], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let errors = '';
      server.stdout.on('data', (b: Buffer) => {
        errors += b.toString();
      });
      server.stderr.on('data', (b: Buffer) => {
        errors += b.toString();
      });
      const exited = new Promise<void>((done) =>
        server.once('exit', () => done()),
      );
      const tool = terminal(['scripts/reset-password.ts'], env);
      try {
        for (let i = 0; i < 100; i++) {
          try {
            if (
              (
                await fetch(`${origin}/health`, {
                  signal: AbortSignal.timeout(500),
                })
              ).ok
            )
              break;
          } catch {
            /* not listening yet */
          }
          await delay(50);
        }
        const headers = {
          cookie: `pandanote_session=${enabled.credential.token}`,
        };
        expect(
          (await fetch(`${origin}/api/notes`, { headers })).status,
          errors,
        ).toBe(200);
        const login = (secret: string) =>
          fetch(`${origin}/api/auth/login`, {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json' },
            body: JSON.stringify({ username: 'fixture', password: secret }),
          });
        const pending = await login(password);
        const challenge = await pending.json();
        expect(challenge.mfaRequired).toBe(true);
        await tool.wait('New password: ');
        tool.send('1234567\r');
        let offset = await tool.wait('Use 8–128');
        await tool.wait('New password: ', offset);
        tool.send('x'.repeat(129) + '\r');
        offset = await tool.wait('Use 8–128', offset);
        await tool.wait('New password: ', offset);
        tool.send(replacement + 'x\u007f\r');
        await tool.wait('Re-enter password: ');
        tool.send('mismatched-secret\r');
        offset = await tool.wait('Passwords do not match');
        await tool.wait('New password: ', offset);
        tool.send(replacement + '\r');
        await tool.wait('Re-enter password: ', offset);
        tool.send(replacement + '\r');
        expect(await tool.exit()).toBe(0);
        expect(tool.output).toContain('Username: fixture');
        expect(tool.output).toContain(`${origin}/login`);
        expect(tool.output).toContain('sign-in limits cleared');
        for (const secret of [
          replacement,
          'x'.repeat(129),
          '1234567',
          'mismatched-secret',
          password,
        ])
          expect(tool.output).not.toContain(secret);
        expect((await fetch(`${origin}/api/notes`, { headers })).status).toBe(
          401,
        );
        expect((await login(password)).status).toBe(401);
        const fresh = await login(replacement);
        expect(fresh.status).toBe(200);
        expect((await fresh.json()).mfaRequired).not.toBe(true);
        const factor = await fetch(`${origin}/api/auth/mfa`, {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({
            challenge: challenge.challenge,
            code: enabled.codes[0],
          }),
        });
        expect(factor.status).toBe(401);
        const inspection = new Database(p.storage.databasePath, {
          readonly: true,
        });
        try {
          expect(inspection.prepare('SELECT * FROM notes').all()).toEqual(note);
          expect(
            inspection.prepare('SELECT * FROM app_settings').all(),
          ).toEqual(settings);
          expect(
            inspection
              .prepare(
                'SELECT totp_enabled,totp_secret_encrypted,last_totp_step,security_revision FROM account',
              )
              .get(),
          ).toEqual({
            totp_enabled: 0,
            totp_secret_encrypted: null,
            last_totp_step: null,
            security_revision: oldRevision + 1,
          });
          expect(
            inspection.prepare('SELECT count(*) n FROM recovery_codes').get(),
          ).toEqual({ n: 0 });
          expect(
            inspection.prepare('SELECT count(*) n FROM auth_challenges').get(),
          ).toEqual({ n: 0 });
        } finally {
          inspection.close();
        }
        expect(readFileSync(p.storage.keyPath)).toEqual(keys);
        expect(
          readFileSync(join(root, 'files', fileId, 'attachment.bin'), 'utf8'),
        ).toBe('file');
        expect(server.exitCode).toBeNull();
      } finally {
        await tool.stop();
        server.kill('SIGTERM');
        await Promise.race([
          exited,
          delay(5000).then(() => {
            server.kill('SIGKILL');
            throw Error('server did not stop');
          }),
        ]);
      }
    });
  },
  90000,
);

it.skipIf(!linux)(
  'PTY refuses arguments/no account/pending restore, leaves journals and DB unchanged and points to setup',
  async () => {
    await withPersistence(async (p, root) => {
      const run = async (args: string[], message: string) => {
        const tool = terminal(
          ['scripts/reset-password.ts', ...args],
          envFor(root),
        );
        try {
          expect(await tool.exit()).toBe(1);
          expect(tool.output).toContain(message);
        } finally {
          await tool.stop();
        }
      };
      await run(['--bad'], 'accepts no arguments');
      await run([], 'http://localhost:3000/setup');
      await createFixtureAccount(new AuthService(p), password, '192.0.2.112');
      const before = p.native.prepare('SELECT * FROM account').get();
      const record = {
        version: 1 as const,
        id: randomUUID(),
        kind: 'restore' as const,
        phase: 'prepared' as const,
        stagedStateId: randomUUID(),
        rollbackStateId: randomUUID(),
        updatedAt: Date.now(),
      };
      new JournalStore(p.storage, p.coordinator).put(record);
      await run([], 'Restore recovery is pending');
      expect(new JournalStore(p.storage, p.coordinator).list()).toEqual([
        record,
      ]);
      await expect(
        new AuthService(p).resetPassword(replacement),
      ).rejects.toMatchObject({ code: 'busy' });
      expect(p.native.prepare('SELECT * FROM account').get()).toEqual(before);
      expect(readdirSync(join(root, 'staging/restores'))).toEqual([]);
    });
  },
);

it.skipIf(!linux)(
  'restore starting during PTY prompting refuses reset without holding DB handles or changing retained state',
  async () => {
    await withPersistence(async (p, root) => {
      await createFixtureAccount(new AuthService(p), password, '192.0.2.114');
      const before = p.native.prepare('SELECT * FROM account').get();
      const tool = terminal(['scripts/reset-password.ts'], envFor(root));
      const store = new JournalStore(p.storage, p.coordinator);
      try {
        await tool.wait('New password: ');
        const record = {
          version: 1 as const,
          id: randomUUID(),
          kind: 'restore' as const,
          phase: 'prepared' as const,
          stagedStateId: randomUUID(),
          rollbackStateId: randomUUID(),
          updatedAt: Date.now(),
        };
        store.put(record);
        tool.send(replacement + '\r');
        await tool.wait('Re-enter password: ');
        tool.send(replacement + '\r');
        expect(await tool.exit()).toBe(1);
        expect(tool.output).not.toContain(replacement);
        expect(tool.output).toContain('pending restore recovery');
        expect(store.list()).toEqual([record]);
        expect(p.native.prepare('SELECT * FROM account').get()).toEqual(before);
      } finally {
        await tool.stop();
      }
    });
  },
);

it.skipIf(!linux)(
  'PTY cancellation does not reset or echo password bytes',
  async () => {
    await withPersistence(async (p, root) => {
      await createFixtureAccount(new AuthService(p), password, '192.0.2.113');
      const before = p.native.prepare('SELECT * FROM account').get();
      const tool = terminal(['scripts/reset-password.ts'], envFor(root));
      try {
        await tool.wait('New password: ');
        tool.send('cancelled-secret\u0003');
        expect(await tool.exit()).toBe(1);
        expect(tool.output).not.toContain('cancelled-secret');
        expect(p.native.prepare('SELECT * FROM account').get()).toEqual(before);
      } finally {
        await tool.stop();
      }
    });
  },
);
