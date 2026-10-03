import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const origin = 'http://127.0.0.1:4173';
const password = 'synthetic-e2e-only-secret 密碼';

test('operator setup, private routes, secure password session, CSRF, logout and retry work in the built app', async ({
  page,
  context,
  request,
}) => {
  const token = (
    JSON.parse(readFileSync('.e2e-data/fixture.json', 'utf8')) as {
      token: string;
    }
  ).token;
  for (const path of [
    '/api/notes',
    '/files/id/display.webp',
    '/attachments/id',
    '/backups/id',
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  }
  for (const spoof of [undefined, 'https://attacker.invalid', 'null']) {
    const response = await request.post('/api/auth/setup', {
      data: { token, password },
      headers: spoof ? { origin: spoof } : {},
    });
    expect(response.status()).toBe(403);
  }
  const invalid = await request.post('/api/auth/setup', {
    data: { token: 'a'.repeat(43), password },
    headers: { origin },
  });
  expect(invalid.status()).toBe(401);
  await page.goto('/setup');
  await page.getByLabel('One-time setup token').fill(token);
  await page.getByLabel('Choose a password').fill(password);
  const setupResponsePromise = page.waitForResponse('/api/auth/setup');
  await page.getByRole('button', { name: 'Create account' }).click();
  const setupResponse = await setupResponsePromise;
  expect(setupResponse.status()).toBe(200);
  await expect(page).toHaveURL(`${origin}/`);
  await expect(
    page.getByText('You are signed in.', { exact: false }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!;
  expect(cookie).toBeDefined();
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.secure).toBe(true);
  expect(cookie.sameSite).toBe('Strict');
  expect(cookie.path).toBe('/');
  expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(6.9 * 86_400);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    cookie.value,
  );
  const body = await page.content();
  for (const secret of [
    password,
    token,
    cookie.value,
    'passwordHash',
    'sessionHash',
    'totpSecretEncrypted',
  ])
    expect(body).not.toContain(secret);
  // APIRequestContext does not share Chromium's Secure-cookie loopback
  // exception, so present the captured credential explicitly on this HTTP test.
  expect(
    (
      await request.get('/__spikes/mermaid', {
        headers: { cookie: `pandanote_session=${cookie.value}` },
        maxRedirects: 0,
      })
    ).status(),
  ).toBe(404);
  const reuse = await request.post('/api/auth/setup', {
    data: { token, password },
    headers: { origin },
  });
  expect(reuse.status()).toBe(401);
  const crossSiteLogout = await page.request.post('/api/auth/logout', {
    headers: { origin: 'https://attacker.invalid' },
  });
  expect(crossSiteLogout.status()).toBe(403);
  await page.reload();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await context.cookies()).some((c) => c.name === 'pandanote_session'),
  ).toBe(false);
  // Revoked token cannot regain access even if manually presented again.
  const revoked = await request.get('/api/notes', {
    headers: { cookie: `pandanote_session=${cookie.value}` },
  });
  expect(revoked.status()).toBe(401);
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Unable to sign in. Check your credentials.',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    'wrong',
  );
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  const loginDto = await request.post('/api/auth/login', {
    data: { password },
    headers: { origin },
  });
  expect(await loginDto.json()).toEqual({ ok: true });
});
