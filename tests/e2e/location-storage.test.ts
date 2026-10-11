import { createHash, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type Page } from '@playwright/test';
import {
  browserSession,
  authenticatedHeaders,
} from '../helpers/browser-session.ts';
import { UNUSED_UPLOAD_QUIET_MS } from '../../src/lib/shared/storage.ts';
async function start(page: Page) {
  await browserSession(page);
  await page.goto('/');
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Write a note…' })
    .click();
  await page
    .getByTestId('composer')
    .getByRole('textbox')
    .fill(`Location ${randomUUID()}`);
}
async function location(page: Page) {
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: /^(Add|Edit) location$/ }).click();
  return page.getByRole('dialog', { name: 'Note location', exact: true });
}

test('manual location stays in memory, validates and posts; denial never blocks posting or loads external maps', async ({
  page,
}) => {
  let calls = 0;
  await page.exposeFunction('recordGeo', () => calls++);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (_ok: unknown, fail: (e: { code: number }) => void) => {
        void (window as unknown as { recordGeo(): Promise<void> }).recordGeo();
        fail({ code: 1 });
      },
    });
  });
  await start(page);
  const text = await page
    .getByTestId('composer')
    .getByRole('textbox')
    .inputValue();
  let dialog = await location(page);
  expect(calls).toBe(0);
  await dialog.getByRole('button', { name: 'Use current location' }).click();
  await expect(dialog.getByRole('alert')).toContainText('denied');
  await dialog.getByLabel('Latitude', { exact: true }).fill('91');
  await dialog.getByLabel('Longitude', { exact: true }).fill('114.1');
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).not.toBeEmpty();
  await dialog.getByLabel('Latitude', { exact: true }).fill('22.3');
  await dialog.getByLabel('Location label (optional)').fill('香港 notebook');
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  dialog = await location(page);
  await expect(dialog.getByLabel('Latitude', { exact: true })).toHaveValue(
    '22.3',
  );
  await page.keyboard.press('Escape');
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(page.getByTestId('composer')).toContainText('Saved on server.');
  const result = await page.request.get(
    `/api/notes?q=${encodeURIComponent(text)}`,
    { headers: await authenticatedHeaders(page) },
  );
  const id = (await result.json()).data.items[0].id;
  const saved = (
    await (
      await page.request.get(`/api/notes/${id}`, {
        headers: await authenticatedHeaders(page),
      })
    ).json()
  ).data;
  expect(saved.location).toEqual({
    latitude: 22.3,
    longitude: 114.1,
    accuracy: null,
    label: '香港 notebook',
  });
  expect(calls).toBe(1);
});

test('native explicit geolocation preserves accuracy; manual coordinates clear it and reload drops unsaved metadata', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    latitude: 22.3,
    longitude: 114.1,
    accuracy: 12,
  });
  await start(page);
  let dialog = await location(page);
  await dialog.getByRole('button', { name: 'Use current location' }).click();
  await expect(dialog.getByLabel('Latitude', { exact: true })).toHaveValue(
    '22.3',
  );
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  dialog = await location(page);
  await dialog.getByLabel('Latitude', { exact: true }).fill('23');
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  const posted = page.waitForResponse(
    (r) => r.url().endsWith('/api/notes') && r.request().method() === 'POST',
  );
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  const result = (await (await posted).json()).data;
  const note = (
    await (
      await page.request.get(`/api/notes/${result.noteId}`, {
        headers: await authenticatedHeaders(page),
      })
    ).json()
  ).data;
  expect(note.location).toEqual({
    latitude: 23,
    longitude: 114.1,
    accuracy: null,
    label: null,
  });
  await expect(page.getByTestId('composer')).toContainText('Saved on server.');
  await page
    .getByTestId('composer')
    .getByRole('textbox')
    .fill('Unsaved location');
  dialog = await location(page);
  await dialog.getByLabel('Latitude', { exact: true }).fill('0');
  await dialog.getByLabel('Longitude', { exact: true }).fill('0');
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await expect(page.getByTestId('composer').getByRole('textbox')).toHaveValue(
    '',
  );
});

test('storage limits persist and explicit cleanup protects recent attempts then deletes abandoned bytes', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/settings');
  const refresh = page.getByRole('button', {
    name: 'Refresh storage',
    exact: true,
  });
  await expect(refresh).toBeEnabled();
  const id = randomUUID(),
    bytes = Buffer.from('unused synthetic bytes');
  const init = await page.request.post('/api/uploads', {
    headers: await authenticatedHeaders(page),
    data: {
      mutationId: randomUUID(),
      requestDigest: 'a'.repeat(64),
      items: [
        {
          id,
          filename: 'cleanup-session.txt',
          incomingBytes: bytes.length,
          incomingDigest: createHash('sha256').update(bytes).digest('hex'),
        },
      ],
    },
  });
  const batch = (await init.json()).data.batch.id;
  expect(
    (
      await page.request.put(`/api/uploads/${batch}/${id}`, {
        headers: {
          ...(await authenticatedHeaders(page)),
          'content-type': 'application/octet-stream',
        },
        data: bytes,
      })
    ).status(),
  ).toBe(200);
  const measured = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/settings/storage') &&
      r.request().method() === 'GET',
  );
  await refresh.click();
  await measured;
  await expect(refresh).toBeEnabled();
  let row = page
    .locator('.attempts li')
    .filter({ hasText: 'cleanup-session.txt' });
  await expect(
    row.getByRole('button', { name: 'Clean unused attempt' }),
  ).toBeDisabled();
  const data = readdirSync('.e2e-data').find((s) => s.startsWith('run-'))!;
  const db = new Database(join('.e2e-data', data, 'db/pandanote.sqlite'));
  db.prepare('update upload_batches set activity_at=? where id=?').run(
    Date.now() - UNUSED_UPLOAD_QUIET_MS - 10_000,
    batch,
  );
  expect(
    db.prepare('select activity_at from upload_batches where id=?').get(batch),
  ).toEqual({ activity_at: expect.any(Number) });
  db.close();
  const aged = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/settings/storage') &&
      r.request().method() === 'GET',
  );
  await refresh.click();
  const usage = await (await aged).json();
  expect(
    usage.data.usage.pendingUploads.find((a: { id: string }) => a.id === batch)
      ?.eligible,
  ).toBe(true);
  row = page.locator('.attempts li').filter({ hasText: 'cleanup-session.txt' });
  await row.getByRole('button', { name: 'Clean unused attempt' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Clean unused uploads',
    exact: true,
  });
  await expect(dialog).toContainText('cannot be undone');
  await dialog.getByRole('button', { name: 'Confirm cleanup' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Unused attempt cleaned' }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(`/api/attachments/${id}/file`, {
        headers: await authenticatedHeaders(page),
      })
    ).status(),
  ).toBe(404);
});
