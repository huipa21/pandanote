import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, type Cookie, type Page } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
const cache = '.e2e-data/browser-session.json';
/** Reuse only real server-issued synthetic credentials across Playwright workers.
 * This private test file is ignored and removed with the owned E2E fixture. It
 * avoids spending a login per suite; production limits/auth checks stay intact. */
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
    data: { password },
  });
  if (response.status() === 401) {
    const { token } = JSON.parse(
      readFileSync('.e2e-data/fixture.json', 'utf8'),
    ) as { token: string };
    response = await page.request.post('/api/auth/setup', {
      headers: { origin },
      data: { token, password },
    });
  }
  expect(response.status()).toBe(200);
  const cookies = await page.context().cookies();
  writeFileSync(cache, JSON.stringify(cookies), { mode: 0o600 });
  return cookies;
}
