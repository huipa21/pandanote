import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, type Cookie, type Page } from '@playwright/test';
import { readSetupCode } from './setup-code.ts';
const origin = 'http://127.0.0.1:4173';
const cache = '.e2e-data/browser-session.json';
/** Reuse only real server-issued synthetic credentials across Playwright workers.
 * This private test file is ignored and removed with the owned E2E fixture. It
 * avoids spending a login per suite; production limits/auth checks stay intact. */
export async function authenticatedHeaders(page: Page) {
  const cookies = await browserSession(page);
  return {
    origin,
    cookie: `pandanote_session=${cookies.find((cookie) => cookie.name === 'pandanote_session')!.value}`,
  };
}
export async function browserSession(page: Page): Promise<Cookie[]> {
  if (existsSync(cache)) {
    const cookies = JSON.parse(readFileSync(cache, 'utf8')) as Cookie[];
    const cookie = cookies.find((c) => c.name === 'pandanote_session');
    if (cookie) {
      const response = await page.request.get('/api/auth/security', {
        headers: { cookie: `${cookie.name}=${cookie.value}` },
      });
      if (response.ok()) {
        await page.context().addCookies(cookies);
        return cookies;
      }
    }
  }
  const password = 'synthetic-e2e-only-secret 密碼';
  let response = await page.request.post('/api/auth/login', {
    headers: { origin },
    data: { username: 'fixture', password },
  });
  if (response.status() === 409) {
    response = await page.request.post('/api/setup/account', {
      headers: { origin },
      data: {
        username: 'fixture',
        email: 'fixture@example.invalid',
        password,
        passwordConfirm: password,
        setupCode: await readSetupCode(origin),
      },
    });
    expect(response.status()).toBe(200);
    const cookie = (await page.context().cookies()).find(
      (c) => c.name === 'pandanote_session',
    )!;
    expect(
      (
        await page.request.post('/api/setup/preferences', {
          headers: { origin, cookie: `${cookie.name}=${cookie.value}` },
          data: { siteTitle: 'PandaNote', language: 'en', timezone: 'UTC' },
        })
      ).status(),
    ).toBe(200);
  }
  expect(response.status()).toBe(200);
  const cookies = await page.context().cookies();
  writeFileSync(cache, JSON.stringify(cookies), { mode: 0o600 });
  return cookies;
}
