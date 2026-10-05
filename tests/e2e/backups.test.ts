import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';
const origin = 'http://127.0.0.1:4173';
const password = 'synthetic-e2e-only-secret 密碼';
async function headers(page: Page) {
  const cookies = await browserSession(page);
  return {
    origin,
    cookie: `pandanote_session=${cookies.find((cookie) => cookie.name === 'pandanote_session')!.value}`,
  };
}
async function settings(page: Page) {
  await browserSession(page);
  await page.goto('/settings');
  await expect(
    page
      .getByTestId('backup-settings')
      .getByRole('button', { name: 'Create full backup' }),
  ).toBeEnabled();
}
async function confirm(
  page: Page,
  action: 'create' | 'download' | 'delete',
  secret = password,
) {
  const dialog = page.getByRole('dialog', { name: 'Authorize backup action' });
  await dialog.getByLabel('Password for backup action').fill(secret);
  await dialog
    .getByRole('button', { name: `Confirm ${action} backup` })
    .click();
}
function archiveFile(id: string) {
  const dir = readdirSync('.e2e-data').find((name) => name.startsWith('run-'))!;
  return join('.e2e-data', dir, 'backups', `${id}.pnb`);
}
test('manual full create, protected native download and confirmed delete work in Settings with private warnings and retained local drafts', async ({
  page,
  context,
}) => {
  const h = await headers(page);
  const note = await page.request.post('/api/notes', {
    headers: h,
    data: {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: 'Synthetic full backup 香港',
        timelineAt: null,
        location: null,
        attachmentIds: [],
      },
    },
  });
  expect(note.status()).toBe(200);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await page
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('Local-only excluded backup draft');
  await expect(page.getByTestId('composer').getByRole('status')).toHaveText(
    'Saved on this device.',
  );
  await settings(page);
  const section = page.getByTestId('backup-settings');
  await expect(section).toContainText('unencrypted');
  await expect(section).toContainText(
    'does not protect against losing the VPS',
  );
  await section.getByRole('button', { name: 'Create full backup' }).click();
  await confirm(page, 'create', 'wrong-synthetic-password');
  await expect(page.getByRole('dialog').getByRole('alert')).not.toBeEmpty();
  const created = page.waitForResponse(
    (response) =>
      response.url() === `${origin}/api/backups` &&
      response.request().method() === 'POST',
  );
  await confirm(page, 'create');
  const result = await (await created).json();
  expect(result.ok).toBe(true);
  const id = result.data.id;
  const row = section.locator(`[data-backup-id="${id}"]`);
  await expect(row).toContainText('complete', { timeout: 30_000 });
  await expect(row).toContainText('bytes');
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.browser-spike/s16-backups-desktop.png' });
  expect(
    (
      await page.request.post(`/api/backups/${id}/download`, {
        headers: h,
        form: { grant: 'a'.repeat(43) },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(`/api/backups/${id}/download`, { headers: h })
    ).status(),
  ).toBe(405);
  const anonymous = await context.browser()!.newContext();
  expect(
    (
      await anonymous.request.post(`/api/backups/${id}/download`, {
        headers: { origin },
        form: { grant: 'a'.repeat(43) },
      })
    ).status(),
  ).toBe(401);
  await anonymous.close();
  await row.getByRole('button', { name: 'Download backup' }).click();
  // Chromium reports a target=_blank attachment download on the initiating page.
  const downloadPromise = page.waitForEvent('download');
  await confirm(page, 'download');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`pandanote-${id}.pnb`);
  expect(readFileSync((await download.path())!)).toEqual(
    readFileSync(archiveFile(id)),
  );
  for (const popup of context.pages()) if (popup !== page) await popup.close();
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((value) =>
        value.includes('Local-only excluded backup draft'),
      ),
    ),
  ).toBe(true);
  await row.getByRole('button', { name: 'Delete backup' }).click();
  await expect(page.getByRole('dialog')).toContainText('Permanently delete');
  await confirm(page, 'delete');
  await expect(row).toHaveCount(0);
});
test('lost create response is recoverable by job identity and list refresh after reload, without automatic recreation', async ({
  page,
}) => {
  await settings(page);
  let id = '';
  let creates = 0;
  await page.route('**/api/backups', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    creates++;
    id = route.request().postDataJSON().id;
    await route.fetch();
    await route.abort('failed');
  });
  const section = page.getByTestId('backup-settings');
  await section.getByRole('button', { name: 'Create full backup' }).click();
  await confirm(page, 'create');
  await expect(page.getByRole('dialog').getByRole('alert')).not.toBeEmpty();
  await page.reload();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(section.locator(`[data-backup-id="${id}"]`)).toContainText(
    'complete',
    { timeout: 30_000 },
  );
  expect(creates).toBe(1);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem('pandanote:backup-create:v1'),
    ),
  ).toBeNull();
});
test('mobile backup fresh-auth dialog fits, closes safely, and private mutations reject cross-origin and oversized bodies', async ({
  page,
}) => {
  const h = await headers(page);
  const id = randomUUID();
  expect(
    (
      await page.request.post('/api/backups', {
        headers: { ...h, origin: 'https://attacker.invalid' },
        data: { id, grant: 'a'.repeat(43) },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post('/api/backups', {
        headers: { ...h, 'content-type': 'application/json' },
        data: ' '.repeat(4097),
      })
    ).status(),
  ).toBe(400);
  await page.setViewportSize({ width: 390, height: 600 });
  await settings(page);
  await page
    .getByTestId('backup-settings')
    .getByRole('button', { name: 'Create full backup' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Authorize backup action' });
  await expect(dialog.getByLabel('Password for backup action')).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Confirm create backup' }),
  ).toBeInViewport();
  await page.screenshot({ path: '.browser-spike/s16-backups-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
