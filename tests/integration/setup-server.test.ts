import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, expect, it } from 'vitest';
import { withPersistence } from '../helpers/persistence.ts';
import { setupCodesIn, waitForSetupCode } from '../helpers/setup-code.ts';
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
    // The setup code is the newest logged code; `signed` always uses the current one.
    let code = '';
    const signed = (data: object) => ({ ...data, setupCode: code });
    let stop = await launch();
    // SEC-SETUP-9: one code line and one link line on a fresh start with no account.
    code = await waitForSetupCode(() => output);
    expect(setupCodesIn(output)).toEqual([code]);
    expect(output).toContain(
      `PandaNote setup link: ${origin}/setup#code=${code}`,
    );
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
      // SEC-SETUP-6: after the window even a correct code is setup_closed.
      expect((await post('/api/setup/account', signed(details))).status).toBe(
        403,
      );
      expect((await post('/api/setup/account', {})).status).toBe(403);
      await stop();
      rmSync(marker);
      stop = await launch();
      // A restart prints a new code; the old one now fails with the field error.
      const restarted = await waitForSetupCode(() => output, 2);
      expect(restarted).not.toBe(code);
      const stale = await post(
        '/api/setup/account',
        signed(details),
        '',
        '192.0.2.3',
      );
      expect(stale.status).toBe(400);
      expect((await stale.json()).error.fields).toEqual({
        setupCode:
          'Setup code is incorrect. Use the newest code from the server log.',
      });
      code = restarted;
      expect(await (await get('/setup')).text()).toContain('Create account');
      // LANG-03: before setup completes the browser's Accept-Language decides.
      const localized = (path: string, language?: string, cookie = '') =>
        fetch(`${origin}${path}`, {
          redirect: 'manual',
          headers: {
            cookie,
            ...(language ? { 'accept-language': language } : {}),
          },
        }).then((r) => r.text());
      const htmlLang = (html: string) =>
        /<html[^>]*?lang="([^"]+)"/.exec(html)?.[1];
      const zh = await localized('/setup', 'zh-CN,zh;q=0.9,en;q=0.5');
      expect(htmlLang(zh)).toBe('zh-CN');
      expect(zh).toContain('创建账号');
      expect(zh).not.toContain('>Create account<');
      for (const header of [
        undefined,
        'zh-TW',
        'fr-FR,de;q=0.5',
        '*',
        'zh-CN;q=0',
        '',
      ])
        expect(htmlLang(await localized('/setup', header))).toBe('en');
      expect(
        htmlLang(await localized('/setup', 'fr;q=0.9, zh-Hans-CN;q=0.2')),
      ).toBe('zh-CN');
      const mismatched = await post(
        '/api/setup/account',
        signed({
          ...details,
          passwordConfirm: 'mismatch',
        }),
      );
      expect(mismatched.status).toBe(400);
      expect(await mismatched.text()).not.toContain(details.password);
      // SEC-SETUP-2: a missing or wrong code is a 400 setupCode field error, no account.
      const missing = await post(
        '/api/setup/account',
        details,
        '',
        '192.0.2.4',
      );
      expect(missing.status).toBe(400);
      expect((await missing.json()).error.fields).toEqual({
        setupCode:
          'Setup code is incorrect. Use the newest code from the server log.',
      });
      for (let i = 0; i < 10; i++)
        expect(
          (
            await post(
              '/api/setup/account',
              signed({ ...details, username: '!' }),
              '',
              '192.0.2.2',
            )
          ).status,
        ).toBe(400);
      expect(
        (await post('/api/setup/account', signed(details), '', '192.0.2.2'))
          .status,
      ).toBe(429);
      const race = await Promise.all([
        post('/api/setup/account', signed(details)),
        post('/api/setup/account', signed(details)),
      ]);
      expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
      const cookie = race
        .find((r) => r.status === 200)!
        .headers.get('set-cookie')!
        .split(';')[0];
      // SEC-LOCK-7 / SEC-LOCK-3: the device marker is scoped, HttpOnly and never a session.
      const deviceCookie = race
        .find((r) => r.status === 200)!
        .headers.getSetCookie()
        .find((c) => c.startsWith('pandanote_device='))!;
      expect(deviceCookie).toMatch(/; Path=\/api\/auth(;|$)/);
      expect(deviceCookie).toMatch(/; HttpOnly/);
      expect(deviceCookie).toMatch(/; SameSite=Strict/);
      expect(deviceCookie).toMatch(/; Secure/);
      const expires = /; Expires=([^;]+)/.exec(deviceCookie)?.[1];
      expect(Date.parse(expires!) - Date.now()).toBeLessThanOrEqual(
        180 * 86_400_000 + 60_000,
      );
      const deviceValue = deviceCookie
        .split(';')[0]
        .slice('pandanote_device='.length);
      expect(
        (await get('/api/auth/security', `pandanote_device=${deviceValue}`))
          .status,
      ).toBe(401);
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
      // After setup the saved language/title win over Accept-Language and are public
      // on the sign-in page; the title is escaped plain text (LANG-03/LANG-04).
      const login = await localized('/login', 'zh-CN');
      expect(htmlLang(login)).toBe('en');
      expect(login).toContain('&lt;script>escaped title&lt;/script>');
      expect(login).not.toContain('<script>escaped title');
      expect(login).toContain('Sign in');
      const patch = (data: unknown, headers: Record<string, string> = {}) =>
        fetch(`${origin}/api/settings/general`, {
          method: 'PATCH',
          headers: {
            origin,
            cookie,
            'content-type': 'application/json',
            ...headers,
          },
          body: JSON.stringify(data),
        });
      // LANG-01: unknown codes and malformed requests are rejected unchanged.
      for (const data of [
        {},
        { language: 'fr' },
        { language: 'zh-TW' },
        { language: 'EN' },
        { density: 'huge' },
        { siteTitle: '' },
        { siteTitle: 'x'.repeat(61) },
        { siteTitle: 'bad\u0007' },
        { language: 'en', extra: true },
      ])
        expect((await patch(data)).status).toBe(400);
      expect((await patch({ language: 'en' }, { cookie: '' })).status).toBe(
        401,
      );
      expect(
        (
          await patch(
            { language: 'en' },
            { origin: 'https://attacker.invalid' },
          )
        ).status,
      ).toBe(403);
      expect(htmlLang(await localized('/login', 'zh-CN'))).toBe('en');
      expect((await patch({ language: 'zh-CN' })).status).toBe(200);
      const saved = await localized('/login', 'en');
      expect(htmlLang(saved)).toBe('zh-CN');
      expect(saved).toContain('用户名');
      expect(saved).toContain('&lt;script>escaped title&lt;/script>');
      expect(await localized('/settings', 'en', cookie)).toContain('常规');
      const renamed = await patch({ siteTitle: '  New <b>title</b> ' });
      expect(renamed.status).toBe(200);
      expect((await renamed.json()).data).toMatchObject({
        siteTitle: 'New <b>title</b>',
        language: 'zh-CN',
      });
      expect(await localized('/login')).toContain(
        '<title>登录 · New &lt;b>title&lt;/b></title>',
      );
      expect((await patch({ density: 'spacious' })).status).toBe(200);
      const spacedHtml = await localized('/settings', 'en', cookie);
      expect(spacedHtml).toContain('data-density="spacious"');
      expect(spacedHtml).not.toContain('id="settings-tab-appearance"');
      expect(spacedHtml).not.toContain('id="general-language"');
      expect((await patch({ language: 'en' })).status).toBe(200);
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
      expect(output).not.toContain(deviceValue);
      // SEC-SETUP-7: with an account present, a restart logs no setup code.
      await stop();
      stop = await launch();
      await delay(200);
      expect(setupCodesIn(output)).toHaveLength(2);
      expect(output.match(/PandaNote setup link: /g)).toHaveLength(2);
    } finally {
      await stop();
    }
  });
}, 30_000);
