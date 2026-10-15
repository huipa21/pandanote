import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  authenticatedHeaders,
  browserSession,
} from '../helpers/browser-session.ts';
import { openSettingsTab } from './settings-tab.ts';
const origin = 'http://127.0.0.1:4173',
  password = 'synthetic-e2e-only-secret 密碼';
// Restore replaces shared live data (zh-CN, custom title/timezone). Reset it even when
// a step fails, so later specs (and later worker groups) start from English defaults.
test.afterEach(async ({ page }) => {
  const headers = await authenticatedHeaders(page);
  await page.request.patch('/api/settings/general', {
    headers,
    data: { siteTitle: 'PandaNote', language: 'en' },
  });
  await page.request.patch('/api/settings/calendar', {
    headers,
    data: { timezone: 'UTC', weekStart: 1 },
  });
});
test('downloaded full archive is uploaded/validated/confirmed through Settings, replaces live data, preserves local work/backups and invalidates sessions', async ({
  page,
  context,
}) => {
  // Separate synthetic client bucket; production IP/account limits stay unchanged.
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.200' });
  const cookies = await browserSession(page);
  const oldToken = cookies.find((c) => c.name === 'pandanote_session')!.value;
  const headers = { origin, cookie: `pandanote_session=${oldToken}` };
  const command = {
    action: 'create',
    mutationId: randomUUID(),
    content: {
      bodyMarkdown: 'web restore original 香港 #Roundtrip',
      timelineAt: null,
      attachmentIds: [],
    },
  };
  const created = await page.request.post('/api/notes', {
    headers,
    data: command,
  });
  expect(created.status()).toBe(200);
  const saved = (await created.json()).data;
  // Include non-default public identity/language settings in the downloaded archive.
  expect(
    (
      await page.request.patch('/api/settings/general', {
        headers,
        data: { siteTitle: 'Archived 香港 notebook', language: 'zh-CN' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch('/api/settings/calendar', {
        headers,
        data: { timezone: 'Asia/Hong_Kong', weekStart: 1 },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/settings');
  // The private UI follows the saved language: zh-CN until it is reset below.
  await openSettingsTab(page, '备份');
  const backups = page.getByTestId('backup-settings'),
    restores = page.getByTestId('restore-settings');
  // Backup create/download ask for no password since 7bda440.
  const creating = page.waitForResponse(
    (r) =>
      r.url() === `${origin}/api/backups` && r.request().method() === 'POST',
  );
  await backups
    .getByRole('button', { name: '创建完整备份', exact: true })
    .click();
  const job = (await (await creating).json()).data;
  const row = backups.locator(`[data-backup-id="${job.id}"]`);
  await expect(row).toContainText('已完成', { timeout: 30000 });
  const downloading = page.waitForEvent('download');
  await row.getByRole('button', { name: '下载备份' }).click();
  const download = await downloading,
    archivePath = (await download.path())!;
  for (const popup of context.pages()) if (popup !== page) await popup.close();
  expect(
    (
      await page.request.patch('/api/settings/general', {
        headers,
        data: { siteTitle: 'Temporary destination', language: 'en' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch('/api/settings/calendar', {
        headers,
        data: { timezone: 'UTC', weekStart: 1 },
      })
    ).status(),
  ).toBe(200);
  const updated = await page.request.patch(`/api/notes/${saved.noteId}`, {
    headers,
    data: {
      action: 'update',
      mutationId: randomUUID(),
      noteId: saved.noteId,
      expectedRevision: 1,
      content: {
        ...command.content,
        bodyMarkdown: 'modified since archive #Roundtrip',
        timelineAt: Date.now() - 1000,
      },
    },
  });
  expect(updated.status()).toBe(200);
  // Back to English for the restore steps; the page renders the saved language.
  await page.reload();
  await openSettingsTab(page, 'Backups');
  await restores.getByLabel('PandaNote backup archive').setInputFiles({
    name: 'downloaded.pnb',
    mimeType: 'application/octet-stream',
    buffer: readFileSync(archivePath),
  });
  await restores
    .getByRole('button', { name: 'Upload and validate backup', exact: true })
    .click();
  const upload = page.getByRole('dialog', { name: 'Authorize restore upload' });
  await upload.getByLabel('Current password for restore').fill(password);
  await upload
    .getByRole('button', { name: 'Confirm upload and validate' })
    .click();
  await expect(restores.getByTestId('restore-summary')).toBeVisible({
    timeout: 60000,
  });
  await expect(restores).toContainText('Nothing has been replaced');
  expect(
    (
      await page.request.get(`/api/notes/${saved.noteId}`, { headers })
    ).status(),
  ).toBe(200);
  expect(
    (
      await (
        await page.request.get(`/api/notes/${saved.noteId}`, { headers })
      ).json()
    ).data.bodyMarkdown,
  ).toBe('modified since archive #Roundtrip');
  await page.reload();
  await openSettingsTab(page, 'Backups');
  await expect(restores.getByTestId('restore-summary')).toBeVisible();
  await restores.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.browser-spike/s17-restore-summary.png' });
  await restores
    .getByRole('button', { name: 'Replace application from backup' })
    .click();
  const confirm = page.getByRole('dialog', { name: 'Confirm full restore' });
  await expect(
    confirm.getByRole('button', {
      name: 'Confirm replace all application data',
    }),
  ).toBeDisabled();
  await confirm
    .getByLabel('I understand that current application data will be replaced.')
    .check();
  await confirm.getByLabel('Current password for restore').fill(password);
  await confirm
    .getByRole('button', { name: 'Confirm replace all application data' })
    .click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 60000 });
  expect((await page.request.get('/api/notes', { headers })).status()).toBe(
    401,
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Archived 香港 notebook',
  );
  await page.locator('input[autocomplete="username"]').fill('FIXTURE');
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`);
  const freshCookies = await context.cookies();
  const newHeaders = {
    origin,
    cookie: `pandanote_session=${freshCookies.find((c) => c.name === 'pandanote_session')!.value}`,
  };
  const restored = await page.request.get(`/api/notes/${saved.noteId}`, {
    headers: newHeaders,
  });
  expect((await restored.json()).data).toMatchObject({
    bodyMarkdown: command.content.bodyMarkdown,
    revision: 1,
  });
  await page.goto('/settings');
  await openSettingsTab(page, '备份');
  await expect(row).toContainText('已完成');
  expect(
    (await page.request.get('/api/restores', { headers: newHeaders })).status(),
  ).toBe(200);
  await expect(restores.getByTestId('restore-summary')).toHaveCount(0);
  await openSettingsTab(page, '账号');
  await expect(page.locator('input[autocomplete="username"]')).toHaveValue(
    'fixture',
  );
  await expect(page.locator('input[autocomplete="email"]')).toHaveValue(
    'fixture@example.invalid',
  );
  await openSettingsTab(page, '日历');
  await expect(page.getByLabel('应用时区', { exact: true })).toHaveValue(
    'Asia/Hong_Kong',
  );
  await expect(page).toHaveTitle(/Archived 香港 notebook/);
  // Keep the shared synthetic instance predictable for subsequent full-suite specs.
  expect(
    (
      await page.request.patch('/api/settings/general', {
        headers: newHeaders,
        data: { siteTitle: 'PandaNote', language: 'en' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.patch('/api/settings/calendar', {
        headers: newHeaders,
        data: { timezone: 'UTC', weekStart: 1 },
      })
    ).status(),
  ).toBe(200);
});
test('invalid private upload leaves live app usable; CSRF/auth/fresh-scope checks and mobile destructive confirmation are enforced', async ({
  page,
  context,
}) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.201' });
  const cookies = await browserSession(page),
    headers = {
      origin,
      cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
    };
  const rawHeaders = {
    ...headers,
    'x-archive-bytes': '10',
    'x-restore-grant': 'a'.repeat(43),
  };
  expect(
    (
      await page.request.post('/api/restores', {
        headers: { ...rawHeaders, origin: 'https://attacker.invalid' },
        data: 'notarchive',
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/restores', {
        headers: rawHeaders,
        data: 'notarchive',
      })
    ).status(),
  ).toBe(403);
  const anonymous = await context.browser()!.newContext();
  expect(
    (
      await anonymous.request.post('/api/restores', {
        headers: { origin },
        data: 'notarchive',
      })
    ).status(),
  ).toBe(401);
  await anonymous.close();
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/settings');
  await openSettingsTab(page, 'Backups');
  const section = page.getByTestId('restore-settings');
  await section.getByLabel('PandaNote backup archive').setInputFiles({
    name: 'invalid.pnb',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('not a PandaNote archive'),
  });
  await section
    .getByRole('button', { name: 'Upload and validate backup', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Authorize restore upload' });
  await expect(
    dialog.getByRole('button', { name: 'Confirm upload and validate' }),
  ).toBeInViewport();
  await page.screenshot({ path: '.browser-spike/s17-restore-mobile.png' });
  await dialog.getByLabel('Current password for restore').fill(password);
  await dialog
    .getByRole('button', { name: 'Confirm upload and validate' })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Current data is unchanged',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect((await page.request.get('/api/notes', { headers })).status()).toBe(
    200,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
