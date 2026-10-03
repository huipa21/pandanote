import { readFileSync } from 'node:fs';
import { generateSync } from 'otplib';
import { expect, test, request as playwrightRequest } from '@playwright/test';

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

test('confirmed MFA, recovery download/regeneration, fresh scopes, security changes and revoke-all work in the built security UI', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  // Separate deployment keeps real persistent abuse limits enabled, without
  // polluting the shared shell/renderer fixture's legitimate login budget.
  const origin = 'https://127.0.0.1:4175';
  const context = await browser.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const request = await playwrightRequest.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
  });
  const login = await page.request.post('/api/auth/login', {
    data: { password },
    headers: { origin },
  });
  if (login.status() === 401) {
    const { token } = JSON.parse(
      readFileSync('.e2e-data/security/fixture.json', 'utf8'),
    ) as { token: string };
    expect(
      (
        await page.request.post('/api/auth/setup', {
          data: { token, password },
          headers: { origin },
        })
      ).status(),
    ).toBe(200);
  } else expect(login.status()).toBe(200);
  const second = await browser.newContext({ ignoreHTTPSErrors: true });
  const other = await second.newPage();
  const loginOther = await second.request.post(`${origin}/api/auth/login`, {
    data: { password },
    headers: { origin },
  });
  expect(loginOther.status()).toBe(200);
  await other.goto(`${origin}/settings`);
  const oldCookie = (await second.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!;
  expect(oldCookie).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: 'Strict',
    path: '/',
  });
  expect(await other.evaluate(() => document.cookie)).not.toContain(
    oldCookie.value,
  );
  const cookieHeader = async () => ({
    origin,
    cookie: `pandanote_session=${(await context.cookies()).find((c) => c.name === 'pandanote_session')!.value}`,
  });
  const post = async (path: string, data: unknown) =>
    page.request.post(path, { data, headers: await cookieHeader() });
  async function securityAction(
    action: string,
    currentPassword: string,
    code?: string,
  ) {
    await page
      .getByLabel('Security action', { exact: true })
      .selectOption(action);
    await page
      .getByLabel('Current password', { exact: true })
      .fill(currentPassword);
    if (code)
      await page
        .getByLabel('Authenticator or recovery code', { exact: true })
        .fill(code);
  }
  async function clickAction() {
    const response = page.waitForResponse('/api/auth/security');
    await page
      .getByRole('button', { name: 'Authenticate and continue' })
      .click();
    return response;
  }
  const cspErrors: string[] = [];
  page.on('console', (msg) => {
    if (/content security policy/i.test(msg.text())) cspErrors.push(msg.text());
  });
  page.on('dialog', (dialog) => dialog.accept());
  try {
    await page.goto('/settings');
    await expect(
      page.getByText('MFA: disabled.', { exact: true }),
    ).toBeVisible();
    // All security boundaries require a session, exact Origin and fresh scope.
    for (const path of ['/api/auth/security', '/api/auth/fresh'])
      expect(
        (await request.post(path, { data: {}, headers: { origin } })).status(),
      ).toBe(401);
    expect(
      (
        await page.request.post('/api/auth/security', {
          data: { action: 'enroll', grant: 'a'.repeat(43) },
          headers: {
            ...(await cookieHeader()),
            origin: 'https://attacker.invalid',
          },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post('/api/auth/security', {
          action: 'enroll',
          grant: 'a'.repeat(43),
        })
      ).status(),
    ).toBe(403);
    await securityAction('enroll', password);
    const enrollmentResponse = await clickAction();
    const enrollment = (await enrollmentResponse.json()).enrollment;
    await expect(
      page.getByRole('img', { name: 'Authenticator enrollment QR code' }),
    ).toBeVisible();
    expect(enrollment.qr.length).toBeGreaterThan(20);
    expect(enrollment.uri).toContain('otpauth://');
    const statusBefore = await page.request.get('/api/auth/security', {
      headers: await cookieHeader(),
    });
    expect((await statusBefore.json()).mfaEnabled).toBe(false);
    await page.getByLabel('New authenticator code').fill('000000');
    await page
      .getByRole('button', { name: 'Confirm MFA', exact: true })
      .click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Unable to sign in' }),
    ).toBeVisible();
    await page
      .getByLabel('New authenticator code')
      .fill(generateSync({ secret: enrollment.secret }));
    const confirmedResponse = page.waitForResponse('/api/auth/security');
    await page
      .getByRole('button', { name: 'Confirm MFA', exact: true })
      .click();
    const codes: string[] = (await (await confirmedResponse).json()).codes;
    expect(codes).toHaveLength(10);
    await expect(
      page.getByRole('region', { name: 'New recovery codes' }).locator('li'),
    ).toHaveCount(10);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download recovery codes' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('pandanote-recovery-codes.txt');
    const bytes = readFileSync((await download.path())!, 'utf8');
    for (const code of codes) expect(bytes).toContain(code);
    expect(
      (
        await request.get('/api/auth/security', {
          headers: { cookie: `pandanote_session=${oldCookie.value}` },
        })
      ).status(),
    ).toBe(401);
    await other.reload();
    await expect(other).toHaveURL(/\/login$/);
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'New recovery codes' }),
    ).toHaveCount(0);
    expect(
      await (
        await page.request.get('/api/auth/security', {
          headers: await cookieHeader(),
        })
      ).text(),
    ).not.toContain(enrollment.secret);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const pendingResponse = page.waitForResponse('/api/auth/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const pending = await pendingResponse;
    const challenge = (await pending.json()).challenge;
    expect(pending.headers()['set-cookie']).toBeUndefined();
    expect(
      (await context.cookies()).some((c) => c.name === 'pandanote_session'),
    ).toBe(false);
    for (const path of [
      '/api/auth/security',
      '/files/private/display.webp',
      '/backups/private',
    ])
      expect((await request.get(path)).status()).toBe(401);
    await page.getByLabel('Authenticator or recovery code').fill('invalid');
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page.getByRole('alert')).toContainText('Unable to sign in');
    // Confirmation consumed the current step. A next-step code is within the
    // explicit one-step drift and avoids a 30-second wall-clock test sleep.
    await page.getByLabel('Authenticator or recovery code').fill(
      generateSync({
        secret: enrollment.secret,
        epoch: Date.now() / 1000 + 30,
      }),
    );
    await page.getByRole('button', { name: 'Verify code' }).click();
    await expect(page).toHaveURL(`${origin}/`);
    expect(
      (
        await request.post('/api/auth/mfa', {
          data: { challenge, code: codes[9] },
          headers: { origin },
        })
      ).status(),
    ).toBe(401);
    await page.goto('/settings');
    expect(
      (
        await post('/api/auth/fresh', { scope: 'backup-download', password })
      ).status(),
    ).toBe(401);
    const scoped = await post('/api/auth/fresh', {
      scope: 'backup-download',
      password,
      code: codes[0],
    });
    expect(scoped.status()).toBe(200);
    const grant = (await scoped.json()).grant;
    expect(
      (await post('/api/auth/security', { action: 'disable', grant })).status(),
    ).toBe(403);
    const firstRecoveryChallenge = (
      await (
        await request.post('/api/auth/login', {
          data: { password },
          headers: { origin },
        })
      ).json()
    ).challenge;
    const secondRecoveryChallenge = (
      await (
        await request.post('/api/auth/login', {
          data: { password },
          headers: { origin },
        })
      ).json()
    ).challenge;
    const parallelRecovery = await Promise.all(
      [firstRecoveryChallenge, secondRecoveryChallenge].map(
        (pendingChallenge) =>
          request.post('/api/auth/mfa', {
            data: { challenge: pendingChallenge, code: codes[2] },
            headers: { origin },
          }),
      ),
    );
    expect(
      parallelRecovery.map((response) => response.status()).sort(),
    ).toEqual([200, 401]);
    await securityAction('regenerate', password, codes[1]);
    const regen = await clickAction();
    const regenerated: string[] = (await regen.json()).codes;
    expect(regenerated).toHaveLength(10);
    const oldPending = await request.post('/api/auth/login', {
      data: { password },
      headers: { origin },
    });
    const oldChallenge = (await oldPending.json()).challenge;
    expect(
      (
        await request.post('/api/auth/mfa', {
          data: { challenge: oldChallenge, code: codes[3] },
          headers: { origin },
        })
      ).status(),
    ).toBe(401);
    const replacement = 'synthetic-e2e-new-password 密碼';
    await securityAction('password', password, regenerated[0]);
    await page.getByLabel('New password', { exact: true }).fill(replacement);
    expect((await clickAction()).status()).toBe(200);
    await expect(
      page.getByText('Security updated. Other devices have been signed out.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      (
        await request.post('/api/auth/login', {
          data: { password },
          headers: { origin },
        })
      ).status(),
    ).toBe(401);
    await securityAction('enroll', replacement, regenerated[1]);
    const changedEnrollment = (await (await clickAction()).json()).enrollment;
    await page
      .getByLabel('New authenticator code')
      .fill(generateSync({ secret: changedEnrollment.secret }));
    const changedResponse = page.waitForResponse('/api/auth/security');
    await page
      .getByRole('button', { name: 'Confirm MFA', exact: true })
      .click();
    const changedCodes: string[] = (await (await changedResponse).json()).codes;
    expect(changedCodes).toHaveLength(10);
    await securityAction('disable', replacement, changedCodes[0]);
    expect((await clickAction()).status()).toBe(200);
    await expect(
      page.getByText('MFA: disabled.', { exact: true }),
    ).toBeVisible();
    await securityAction('password', replacement);
    await page.getByLabel('New password', { exact: true }).fill(password);
    expect((await clickAction()).status()).toBe(200);
    await securityAction('lifetime', password);
    await page.getByLabel('Session lifetime (days)').fill('7');
    expect((await clickAction()).status()).toBe(200);
    const currentCookie = (await context.cookies()).find(
      (c) => c.name === 'pandanote_session',
    )!;
    await securityAction('revoke', password);
    await clickAction();
    await expect(page).toHaveURL(/\/login$/);
    expect(
      (
        await request.get('/api/auth/security', {
          headers: { cookie: `pandanote_session=${currentCookie.value}` },
        })
      ).status(),
    ).toBe(401);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(`${origin}/`);
    expect(cspErrors).toEqual([]);
  } finally {
    await second.close();
    await context.close();
    await request.dispose();
  }
});
