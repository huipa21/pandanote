import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { AuthService } from '../../src/lib/server/auth/service.ts';

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test port');
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

it('one production build honors two runtime origins, keeps data private, logs out through Kit CSRF and restarts durably', async () => {
  const build = spawnSync(
    process.execPath,
    [resolve('node_modules/vite/bin/vite.js'), 'build'],
    {
      encoding: 'utf8',
      timeout: 35_000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        TEST: 'false',
        VITEST: 'false',
      },
    },
  );
  expect(build.error, build.stderr).toBeUndefined();
  expect(build.status, build.stderr).toBe(0);
  await withPersistence(async (p, root) => {
    const setupToken = new AuthService(p).issueSetupToken();
    await p.close();
    const password = 'synthetic-runtime-only-password';
    for (const deployment of ['loopback', 'https'] as const) {
      const port = await unusedPort();
      const base = `http://127.0.0.1:${port}`;
      const origin =
        deployment === 'loopback' ? base : 'https://notebook.example.test';
      const child = spawn(process.execPath, ['build/index.js'], {
        env: {
          ...process.env,
          HOST: '127.0.0.1',
          PORT: String(port),
          ORIGIN: origin,
          DATA_DIR: root,
          NODE_ENV: 'production',
          TRUSTED_PROXY_IPS: '',
          ADDRESS_HEADER: '',
          HOST_HEADER: '',
          PROTOCOL_HEADER: '',
          PORT_HEADER: '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        output += chunk.toString();
      });
      const exited = new Promise<{
        code: number | null;
        signal: string | null;
      }>((done) => {
        child.once('exit', (code, signal) => done({ code, signal }));
      });
      try {
        let ready = false;
        for (let i = 0; i < 100; i++) {
          try {
            const health = await fetch(`${base}/health`, {
              signal: AbortSignal.timeout(500),
            });
            if (health.ok) {
              ready = true;
              break;
            }
          } catch {
            /* Startup connection refusal is expected. */
          }
          await delay(50);
        }
        expect(ready, output).toBe(true);
        const denied = await fetch(`${base}/files/private`, {
          redirect: 'manual',
        });
        expect(denied.status).toBe(401);
        const page = await fetch(base, { redirect: 'manual' });
        expect(page.status).toBe(303);
        expect(page.headers.get('location')).toBe('/login');
        const login = await fetch(
          `${base}/api/auth/${deployment === 'loopback' ? 'setup' : 'login'}`,
          {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json' },
            body: JSON.stringify(
              deployment === 'loopback'
                ? { token: setupToken, password }
                : { password },
            ),
          },
        );
        expect(login.status, output).toBe(200);
        expect(await login.json()).toEqual({ ok: true });
        const setCookie = login.headers.get('set-cookie')!;
        expect(setCookie).toMatch(/HttpOnly/i);
        expect(setCookie).toMatch(/Secure/i);
        expect(setCookie).toMatch(/SameSite=Strict/i);
        const cookie = setCookie.split(';')[0];
        const home = await fetch(base, { headers: { cookie } });
        expect(home.status).toBe(200);
        expect(await home.text()).not.toContain(password);
        const crossSite = await fetch(`${base}/api/auth/logout`, {
          method: 'POST',
          headers: { cookie, origin: 'https://attacker.invalid' },
        });
        expect(crossSite.status).toBe(403);
        // No content-type: exercise Kit's own form CSRF check, not only hooks.
        const logout = await fetch(`${base}/api/auth/logout`, {
          method: 'POST',
          headers: { cookie, origin },
        });
        expect(logout.status, await logout.text()).toBe(200);
        expect(
          (await fetch(`${base}/api/notes`, { headers: { cookie } })).status,
        ).toBe(401);
        for (const secret of [password, setupToken, cookie.split('=')[1]])
          expect(output).not.toContain(secret);
      } finally {
        child.kill('SIGTERM');
        const exit = await Promise.race([
          exited,
          delay(10_000, undefined, { ref: false }).then(() => {
            child.kill('SIGKILL');
            throw new Error('Built application failed to stop');
          }),
        ]);
        // Windows implements kill as forced termination. Linux exercises the
        // adapter's graceful drain + sveltekit:shutdown persistence close.
        if (process.platform !== 'win32')
          expect(exit).toEqual({ code: 0, signal: null });
      }
    }
  });
}, 60_000);
