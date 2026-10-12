import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { MutationResult } from '../../src/lib/shared/domain.ts';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { setupCodesIn, waitForSetupCode } from '../helpers/setup-code.ts';

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
    await p.close();
    const password = 'synthetic-runtime-only-password';
    const content = {
      bodyMarkdown: 'Synthetic private 香港 #Work',
      timelineAt: 1,
      location: null,
      attachmentIds: [],
    };
    const lostResponse = {
      action: 'create',
      mutationId: randomUUID(),
      content,
    };
    let original: MutationResult | undefined;
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
        // Only the first (no-account) deployment logs a setup code; the HTTPS run reuses the account.
        const setupCode =
          deployment === 'loopback' ? await waitForSetupCode(() => output) : '';
        expect(setupCodesIn(output)).toHaveLength(
          deployment === 'loopback' ? 1 : 0,
        );
        const denied = await fetch(`${base}/files/private`, {
          redirect: 'manual',
        });
        expect(denied.status).toBe(deployment === 'loopback' ? 409 : 401);
        const page = await fetch(base, { redirect: 'manual' });
        expect(page.status).toBe(303);
        expect(page.headers.get('location')).toBe(
          deployment === 'loopback' ? '/setup' : '/login',
        );
        const login = await fetch(
          `${base}${deployment === 'loopback' ? '/api/setup/account' : '/api/auth/login'}`,
          {
            method: 'POST',
            headers: { origin, 'content-type': 'application/json' },
            body: JSON.stringify(
              deployment === 'loopback'
                ? {
                    username: 'fixture',
                    email: 'fixture@example.invalid',
                    password,
                    passwordConfirm: password,
                    setupCode,
                  }
                : { username: 'fixture', password },
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
        if (deployment === 'loopback') {
          const finish = await fetch(`${base}/api/setup/preferences`, {
            method: 'POST',
            headers: { cookie, origin, 'content-type': 'application/json' },
            body: JSON.stringify({
              siteTitle: 'PandaNote',
              language: 'en',
              timezone: 'UTC',
            }),
          });
          expect(finish.status).toBe(200);
        }
        const home = await fetch(base, { headers: { cookie } });
        expect(home.status).toBe(200);
        expect(await home.text()).not.toContain(password);
        const noteRequest = (path: string, value: unknown, method = 'POST') =>
          fetch(`${base}${path}`, {
            method,
            headers: { cookie, origin, 'content-type': 'application/json' },
            body: JSON.stringify(value),
          });
        expect((await fetch(`${base}/api/notes/${randomUUID()}`)).status).toBe(
          401,
        );
        expect(
          (
            await fetch(`${base}/api/notes`, {
              method: 'POST',
              headers: {
                cookie,
                origin: 'https://attacker.invalid',
                'content-type': 'application/json',
              },
              body: JSON.stringify(lostResponse),
            })
          ).status,
        ).toBe(403);
        const post = await noteRequest('/api/notes', lostResponse);
        expect(post.status, await post.clone().text()).toBe(200);
        const posted = (await post.json()).data as MutationResult;
        if (original) expect(posted).toEqual(original);
        else original = posted;
        expect((await noteRequest('/api/notes', lostResponse)).status).toBe(
          200,
        );
        expect(
          (
            await noteRequest('/api/notes', {
              ...lostResponse,
              content: { ...content, bodyMarkdown: 'changed retry' },
            })
          ).status,
        ).toBe(409);
        const local = await noteRequest('/api/notes', {
          ...lostResponse,
          mutationId: randomUUID(),
        });
        const current = (await local.json()).data as MutationResult;
        const path = `/api/notes/${current.noteId}`;
        const read = await fetch(`${base}${path}`, { headers: { cookie } });
        expect(read.headers.get('cache-control')).toContain('no-store');
        expect(await read.json()).toMatchObject({
          data: {
            bodyMarkdown: content.bodyMarkdown,
            revision: 1,
            tags: ['work'],
          },
        });
        const change = {
          action: 'update',
          noteId: current.noteId,
          mutationId: randomUUID(),
          expectedRevision: 1,
          content: { ...content, bodyMarkdown: 'Edited private #Work' },
        };
        expect((await noteRequest(path, change, 'PATCH')).status).toBe(200);
        expect((await noteRequest(path, change, 'PATCH')).status).toBe(200);
        const conflict = await noteRequest(
          path,
          { ...change, mutationId: randomUUID() },
          'PATCH',
        );
        expect(conflict.status).toBe(409);
        expect(await conflict.json()).toMatchObject({
          error: {
            code: 'conflict',
            conflict: { revision: 2, bodyMarkdown: 'Edited private #Work' },
          },
        });
        let revision = 2;
        for (const name of [
          'trash',
          'restore',
          'trash',
          'permanent-delete',
        ] as const) {
          const value = {
            action: name,
            noteId: current.noteId,
            mutationId: randomUUID(),
            expectedRevision: revision,
            ...(name === 'permanent-delete' ? { confirmed: true } : {}),
          };
          const transition = await noteRequest(`${path}/actions`, value);
          expect(transition.status, await transition.clone().text()).toBe(200);
          expect((await transition.json()).data.revision).toBe(++revision);
          expect((await noteRequest(`${path}/actions`, value)).status).toBe(
            200,
          );
        }
        expect(
          (await fetch(`${base}${path}`, { headers: { cookie } })).status,
        ).toBe(404);
        expect(
          (await noteRequest(`/api/notes/${randomUUID()}`, change, 'PATCH'))
            .status,
        ).toBe(400);
        for (const secret of [
          password,
          cookie.split('=')[1],
          content.bodyMarkdown,
          'Edited private #Work',
        ])
          expect(output).not.toContain(secret);
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
        for (const secret of [password, cookie.split('=')[1]])
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

it('fresh server initializes before listening; public health is ready without manual migrations', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pandanote-health-'));
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    ORIGIN: base,
    DATA_DIR: root,
    NODE_ENV: 'production',
    TRUSTED_PROXY_IPS: '',
    ADDRESS_HEADER: '',
    HOST_HEADER: '',
    PROTOCOL_HEADER: '',
    PORT_HEADER: '',
  };
  const child = spawn(process.execPath, ['build/index.js'], {
    env,
    stdio: 'ignore',
  });
  try {
    let before: Response | undefined;
    for (let i = 0; i < 100 && !before; i++) {
      try {
        before = await fetch(`${base}/health`, {
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        await delay(50);
      }
    }
    expect(before?.status).toBe(200);
    expect(await before?.json()).toEqual({ status: 'ok' });
    expect(before?.headers.get('cache-control')).toBe('no-store');
    // Private TCP peers accept absent XFF and reject chains, never guess a hop.
    expect(
      (
        await fetch(`${base}/login`, {
          headers: { 'x-forwarded-for': 'invalid, chain' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${base}/login`, {
          headers: { 'x-forwarded-for': '192.0.2.1' },
        })
      ).status,
    ).toBe(200);
  } finally {
    child.kill('SIGTERM');
    await delay(500);
    rmSync(root, { recursive: true, force: true, maxRetries: 10 });
  }
}, 60_000);
