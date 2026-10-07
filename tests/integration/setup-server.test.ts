import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
beforeAll(() => {
  const build = spawnSync(
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
  expect(build.status, build.stderr).toBe(0);
}, 90_000);
async function port() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const number = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return number;
}
it('real HTTP covers every setup routing cell, expiry page/API/restart, concurrent creation, validation and abuse limits', async () => {
  await withPersistence(async (p, root) => {
    await p.close();
    const marker = join(root, 'advance-test-clock');
    // Isolated child-only injected clock. No application test override or route.
    const preload = `import {existsSync} from 'node:fs'; const original=Date.now; Date.now=()=>original()+(existsSync(${JSON.stringify(marker)})?61*60000:0);`;
    const number = await port();
    const origin = `http://127.0.0.1:${number}`;
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      DATA_DIR: root,
      ORIGIN: origin,
      HOST: '127.0.0.1',
      PORT: String(number),
      ADDRESS_HEADER: '',
      HOST_HEADER: '',
      PROTOCOL_HEADER: '',
      PORT_HEADER: '',
    };
    let output = '';
    const launch = async () => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          `data:text/javascript,${encodeURIComponent(preload)}`,
          'build/index.js',
        ],
        { env, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exited = new Promise<void>((done) =>
        child.once('exit', () => done()),
      );
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
          /* Expected until listen. */
        }
        await delay(50);
      }
      expect((await fetch(`${origin}/health`)).status, output).toBe(200);
      return async () => {
        child.kill('SIGTERM');
        await Promise.race([
          exited,
          delay(5000).then(() => {
            child.kill('SIGKILL');
            throw new Error('Setup fixture did not stop');
          }),
        ]);
      };
    };
    const pages = [
      '/',
      '/login',
      '/settings',
      '/notes/x',
      '/setup',
      '/setup/preferences',
    ];
    const apis = ['/api/notes', '/files/x', '/attachments/x', '/backups/x'];
    const get = (path: string, cookie = '') =>
      fetch(`${origin}${path}`, { redirect: 'manual', headers: { cookie } });
    const post = (path: string, data: unknown, cookie = '', ip = '192.0.2.1') =>
      fetch(`${origin}${path}`, {
        method: 'POST',
        headers: {
          origin,
          cookie,
          'content-type': 'application/json',
          'x-forwarded-for': ip,
        },
        body: JSON.stringify(data),
      });
    const details = {
      username: 'owner',
      email: 'owner@example.invalid',
      password: '12345678',
      passwordConfirm: '12345678',
    };
    let stop = await launch();
    try {
      for (const path of pages) {
        const response = await get(path);
        expect(response.status).toBe(path === '/setup' ? 200 : 303);
        if (path !== '/setup')
          expect(response.headers.get('location')).toBe('/setup');
      }
      for (const path of apis) expect((await get(path)).status).toBe(409);
      writeFileSync(marker, 'advance');
      const expired = await get('/setup');
      expect(await expired.text()).toContain('Setup has timed out');
      expect((await post('/api/setup/account', details)).status).toBe(403);
      expect((await post('/api/setup/account', {})).status).toBe(403);
      await stop();
      rmSync(marker);
      stop = await launch();
      expect(await (await get('/setup')).text()).toContain('Create account');
      const mismatched = await post('/api/setup/account', {
        ...details,
        passwordConfirm: 'mismatch',
      });
      expect(mismatched.status).toBe(400);
      expect(await mismatched.text()).not.toContain(details.password);
      for (let i = 0; i < 10; i++)
        expect(
          (
            await post(
              '/api/setup/account',
              { ...details, username: '!' },
              '',
              '192.0.2.2',
            )
          ).status,
        ).toBe(400);
      expect(
        (await post('/api/setup/account', details, '', '192.0.2.2')).status,
      ).toBe(429);
      const race = await Promise.all([
        post('/api/setup/account', details),
        post('/api/setup/account', details),
      ]);
      expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
      const cookie = race
        .find((r) => r.status === 200)!
        .headers.get('set-cookie')!
        .split(';')[0];
      for (const path of pages) {
        const out = await get(path);
        expect(out.status).toBe(path === '/login' ? 200 : 303);
        if (path !== '/login')
          expect(out.headers.get('location')).toBe('/login');
        const inside = await get(path, cookie);
        expect(inside.status).toBe(path === '/setup/preferences' ? 200 : 303);
        if (path !== '/setup/preferences')
          expect(inside.headers.get('location')).toBe('/setup/preferences');
      }
      for (const path of apis) {
        expect((await get(path)).status).toBe(401);
        expect((await get(path, cookie)).status).toBe(409);
      }
      expect((await post('/api/setup/preferences', {}, '')).status).toBe(401);
      for (const data of [
        { siteTitle: '', language: 'en', timezone: 'UTC' },
        { siteTitle: 'ok', language: 'unknown', timezone: 'UTC' },
        { siteTitle: 'ok', language: 'en', timezone: 'Invalid/Zone' },
      ])
        expect(
          (await post('/api/setup/preferences', data, cookie)).status,
        ).toBe(400);
      const prefs = {
        siteTitle: '<script>escaped title</script>',
        language: 'en',
        timezone: 'Asia/Tokyo',
      };
      expect((await post('/api/setup/preferences', prefs, cookie)).status).toBe(
        200,
      );
      for (const path of ['/setup', '/setup/preferences']) {
        expect((await get(path)).headers.get('location')).toBe('/login');
        expect((await get(path, cookie)).headers.get('location')).toBe('/');
      }
      for (const path of ['/api/setup/account', '/api/setup/preferences'])
        expect((await post(path, {}, cookie)).status).toBe(409);
      expect((await get('/', cookie)).status).toBe(200);
      expect((await get('/api/notes')).status).toBe(401);
      expect((await get('/api/notes', cookie)).status).toBe(200);
      expect(
        (
          await post(
            '/api/auth/account',
            {
              username: 'new',
              email: 'new@example.invalid',
              grant: 'a'.repeat(43),
            },
            cookie,
          )
        ).status,
      ).toBe(403);
      const wrongName = await post('/api/auth/login', {
        username: 'unknown',
        password: details.password,
      });
      const wrongPassword = await post('/api/auth/login', {
        username: 'owner',
        password: 'incorrect',
      });
      expect(wrongName.status).toBe(401);
      expect(await wrongName.json()).toEqual(await wrongPassword.json());
      for (let i = 0; i < 8; i++)
        expect(
          (
            await post('/api/auth/login', {
              username: 'unknown',
              password: 'incorrect',
            })
          ).status,
        ).toBe(401);
      expect(
        (
          await post('/api/auth/login', {
            username: 'owner',
            password: details.password,
          })
        ).status,
      ).toBe(429);
      expect(output).not.toContain(details.password);
      expect(output).not.toContain(cookie.split('=')[1]);
    } finally {
      await stop();
    }
  });
}, 30_000);
