import { createHash, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import {
  browserSession,
  authenticatedHeaders,
} from '../helpers/browser-session.ts';
import { UNUSED_UPLOAD_QUIET_MS } from '../../src/lib/shared/storage.ts';
import { openSettingsTab } from './settings-tab.ts';

test('explicit cleanup protects recent attempts then deletes abandoned bytes', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/settings');
  await openSettingsTab(page, 'Storage');
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
