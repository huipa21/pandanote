import { readFileSync } from 'node:fs';
import { scanSetup } from '../helpers/setup-accessibility.ts';
import { browserSession } from '../helpers/browser-session.ts';
import { generateSync } from 'otplib';
import { expect, test, request as playwrightRequest } from '@playwright/test';

const origin = 'http://127.0.0.1:4173';
const password = 'synthetic-e2e-only-secret 密碼';

test('two-step first run, field retention, resume, routing, secure sessions and username login work in the built app', async ({
  page,
  context,
  request,
  browser,
}) => {
  test.setTimeout(90_000);
  const account = {
    username: 'FIXTURE',
    email: 'fixture@example.invalid',
    password,
    passwordConfirm: password,
  };
  for (const path of [
    '/',
    '/login',
    '/notes/x',
    '/settings',
    '/setup/preferences',
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe('/setup');
  }
  for (const path of [
    '/api/notes',
    '/files/id/display.webp',
    '/attachments/id',
    '/backups/id',
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe('setup_required');
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('DENY');
  }
  for (const spoof of [undefined, 'https://attacker.invalid', 'null']) {
    expect(
      (
        await request.post('/api/setup/account', {
          data: account,
          headers: spoof ? { origin: spoof } : {},
        })
      ).status(),
    ).toBe(403);
  }
  const invalid = await request.post('/api/setup/account', {
    data: { ...account, passwordConfirm: 'mismatch' },
    headers: { origin },
  });
  expect(invalid.status()).toBe(400);
  expect(await invalid.text()).not.toContain(password);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Create account' }),
  ).toBeEnabled();
  await scanSetup(page);
  await page.getByLabel('Username', { exact: true }).fill('ab');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Re-enter password').fill('mismatch');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('#username-error')).toContainText('3–32');
  await expect(page.locator('#confirm-error')).toContainText('match');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    password,
  );
  for (const invalid of ['ab', 'a'.repeat(33), 'bad name']) {
    await page.getByLabel('Username', { exact: true }).fill(invalid);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#username-error')).not.toBeEmpty();
    await expect(page.getByLabel('Username', { exact: true })).toHaveValue(
      invalid,
    );
  }
  await page.getByLabel('Username', { exact: true }).fill('FIXTURE');
  for (const invalid of ['', 'bad-email', 'a'.repeat(245) + '@example.io']) {
    await page.getByLabel('Email', { exact: true }).fill(invalid);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#email-error')).not.toBeEmpty();
  }
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  for (const invalid of ['1234567', 'a'.repeat(129)]) {
    await page.getByLabel('Password', { exact: true }).fill(invalid);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#password-error')).not.toBeEmpty();
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
      invalid,
    );
  }
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Re-enter password').fill(password);
  // Keyboard-only activation of the explicit submit button.
  await page.getByLabel('Re-enter password').press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(`${origin}/setup/preferences`);
  await expect(
    page.getByRole('button', { name: 'Finish setup' }),
  ).toBeEnabled();
  await scanSetup(page);
  const cookie = (await context.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!;
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
  });
  expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(6.9 * 86_400);
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    cookie.value,
  );
  const headers = { cookie: `pandanote_session=${cookie.value}` };
  expect((await request.get('/api/notes', { headers })).status()).toBe(409);
  expect(
    (await request.get('/settings', { headers, maxRedirects: 0 })).headers()
      .location,
  ).toBe('/setup/preferences');
  expect(
    (
      await request.post('/api/setup/account', {
        data: account,
        headers: { origin },
      })
    ).status(),
  ).toBe(409);
  // Leave after step one. A different device signs in and must finish preferences.
  const mobile = await browser.newContext({
    baseURL: origin,
    locale: 'zh-CN',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 390, height: 844 },
  });
  try {
    const resume = await mobile.newPage();
    await resume.goto('/');
    await expect(resume).toHaveURL(/\/login$/);
    // LANG-03: setup is incomplete, so this zh-CN browser gets Chinese screens.
    await expect(resume.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(resume).toHaveTitle('登录 · PandaNote');
    await resume.getByLabel('用户名', { exact: true }).fill('FiXtUrE');
    await resume.getByLabel('密码', { exact: true }).fill(password);
    await resume.getByRole('button', { name: '登录', exact: true }).click();
    await expect(resume).toHaveURL(/\/setup\/preferences$/);
    await expect(resume.getByLabel('站点标题')).toHaveValue('PandaNote');
    await expect(resume.getByLabel('语言')).toHaveValue('zh-CN');
    await expect(resume.getByLabel('时区')).toHaveValue('Asia/Tokyo');
    await expect(resume.getByText('翻译进行中')).toBeVisible();
    await expect(
      resume.getByRole('button', { name: '完成设置' }),
    ).toBeVisible();
    expect(
      await resume.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await resume.getByLabel('站点标题').fill('PandaNote');
    // Choosing English previews the English screen before anything is saved.
    await resume.getByLabel('语言').selectOption('en');
    await expect(resume.locator('html')).toHaveAttribute('lang', 'en');
    await expect(resume.getByLabel('Timezone')).toBeVisible();
    await resume.getByLabel('Timezone').fill('UTC');
    await resume.getByLabel('Timezone').press('Tab');
    await resume.keyboard.press('Enter');
    await expect(resume).toHaveURL(`${origin}/`);
  } finally {
    await mobile.close();
  }
  for (const path of ['/setup', '/setup/preferences'])
    expect(
      (await request.get(path, { headers, maxRedirects: 0 })).headers()
        .location,
    ).toBe('/');
  expect(
    (
      await request.post('/api/setup/preferences', {
        headers: { ...headers, origin },
        data: { siteTitle: 'again', language: 'en', timezone: 'UTC' },
      })
    ).status(),
  ).toBe(409);
  await page.goto('/');
  const body = await page.content();
  for (const secret of [
    password,
    cookie.value,
    'passwordHash',
    'sessionHash',
    'totpSecretEncrypted',
  ])
    expect(body).not.toContain(secret);
  expect(
    (
      await request.get('/__spikes/mermaid', { headers, maxRedirects: 0 })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.post('/api/auth/logout', {
        headers: { origin: 'https://attacker.invalid' },
      })
    ).status(),
  ).toBe(403);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await context.cookies()).some((c) => c.name === 'pandanote_session'),
  ).toBe(false);
  expect((await request.get('/api/notes', { headers })).status()).toBe(401);
  expect(
    (await request.get('/setup', { maxRedirects: 0 })).headers().location,
  ).toBe('/login');
  await page.getByLabel('Username', { exact: true }).fill('fixture');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Invalid username or password.',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
    'wrong',
  );
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  const loginDto = await request.post('/api/auth/login', {
    data: { username: 'fixture', password },
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
    data: { username: 'fixture', password },
    headers: { origin },
  });
  if (login.status() === 409) {
    expect(
      (
        await page.request.post('/api/setup/account', {
          data: {
            username: 'fixture',
            email: 'fixture@example.invalid',
            password,
            passwordConfirm: password,
          },
          headers: { origin },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post('/api/setup/preferences', {
          data: { siteTitle: 'PandaNote', language: 'en', timezone: 'UTC' },
          headers: { origin },
        })
      ).status(),
    ).toBe(200);
  } else expect(login.status()).toBe(200);
  const second = await browser.newContext({ ignoreHTTPSErrors: true });
  const other = await second.newPage();
  const loginOther = await second.request.post(`${origin}/api/auth/login`, {
    data: { username: 'fixture', password },
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
      page
        .getByRole('alert')
        .filter({ hasText: 'Invalid username or password' }),
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
      page.getByLabel('Account authenticator or recovery code'),
    ).toBeVisible();
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
    await page.getByLabel('Username', { exact: true }).fill('fixture');
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
    await expect(page.getByRole('alert')).toContainText(
      'Invalid username or password',
    );
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
          data: { username: 'fixture', password },
          headers: { origin },
        })
      ).json()
    ).challenge;
    const secondRecoveryChallenge = (
      await (
        await request.post('/api/auth/login', {
          data: { username: 'fixture', password },
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
      data: { username: 'fixture', password },
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
          data: { username: 'fixture', password },
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
    await page.getByLabel('Username', { exact: true }).fill('fixture');
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

test('Sign out waits for hydration and then revokes the session', async ({
  page,
}) => {
  const shared = await browserSession(page);
  // Revoke this test's own real session, not the suite's reusable credential.
  // Use an isolated synthetic client bucket without changing production limits.
  const login = await page.request.post('/api/auth/login', {
    headers: { origin, 'x-forwarded-for': '192.0.2.240' },
    data: { username: 'fixture', password },
  });
  expect(login.status()).toBe(200);
  expect(
    (await page.context().cookies()).find((c) => c.name === 'pandanote_session')
      ?.value,
  ).not.toBe(shared.find((c) => c.name === 'pandanote_session')?.value);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_app/immutable/entry/*.js', async (route) => {
    await held;
    await route.continue();
  });
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
  try {
    await page.goto('/settings', { waitUntil: 'commit' });
    await expect(signOut).toBeDisabled();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
  await expect(signOut).toBeEnabled();
  await signOut.click();
  await expect(page).toHaveURL(/\/login$/);
  const privateResponse = await page.request.get('/api/notes');
  expect(privateResponse.status()).toBe(401);
});

test('Account settings require fresh authentication, retain errors and change the next login username without signing out sessions', async ({
  page,
}) => {
  const cookies = await browserSession(page);
  const cookie = cookies.find((c) => c.name === 'pandanote_session')!;
  const headers = { origin, cookie: `${cookie.name}=${cookie.value}` };
  await page.goto('/settings');
  await page.getByLabel('Account username').fill('!');
  await page
    .getByRole('button', { name: 'Authenticate and save account' })
    .click();
  await expect(page.locator('#account-username-error')).not.toBeEmpty();
  await page.getByLabel('Account username').fill('Updated.Owner');
  await page.getByLabel('Account email').fill('Owner@example.invalid');
  await page.getByLabel('Password to update account').fill('wrong');
  await page
    .getByRole('button', { name: 'Authenticate and save account' })
    .click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Invalid username or password' }),
  ).toBeVisible();
  await expect(page.getByLabel('Account username')).toHaveValue(
    'Updated.Owner',
  );
  await page.getByLabel('Password to update account').fill(password);
  await page
    .getByRole('button', { name: 'Authenticate and save account' })
    .click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Account saved.' }),
  ).toBeVisible();
  expect(
    (await page.request.get('/api/auth/security', { headers })).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/auth/login', {
        headers: { origin },
        data: { username: 'fixture', password },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post('/api/auth/login', {
        headers: { origin },
        data: { username: 'UPDATED.OWNER', password },
      })
    ).status(),
  ).toBe(200);
  // Keep the shared fixture identity stable for other feature regressions.
  await page.getByLabel('Account username').fill('fixture');
  await page.getByLabel('Account email').fill('fixture@example.invalid');
  await page.getByLabel('Password to update account').fill(password);
  await page
    .getByRole('button', { name: 'Authenticate and save account' })
    .click();
  await expect(page.getByLabel('Account username')).toHaveValue('fixture');
  await expect(
    page.getByRole('status').filter({ hasText: 'Account saved.' }),
  ).toBeVisible();
});
