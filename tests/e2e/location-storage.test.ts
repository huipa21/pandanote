import { createHash, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type Page } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';
import { DEFAULT_SETTINGS } from '../../src/lib/shared/settings.ts';
import {
  storageLimitsFrom,
  UNUSED_UPLOAD_QUIET_MS,
} from '../../src/lib/shared/storage.ts';
import type { LocalDraft } from '../../src/lib/client/drafts/model.ts';
const origin = 'http://127.0.0.1:4173';
async function headers(page: Page) {
  const cookies = await browserSession(page);
  return {
    origin,
    cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
  };
}
async function records(page: Page): Promise<LocalDraft[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.includes(':record:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .filter((draft) => !draft.deleted),
  );
}
async function start(page: Page, text: string) {
  await browserSession(page);
  await page.goto('/drafts');
  await page
    .getByRole('button', { name: 'Create another draft', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill(text);
  await expect(page.getByTestId('composer').getByRole('status')).toHaveText(
    'Saved on this device.',
  );
}
const composer = (page: Page) => page.getByTestId('composer');
async function resetLimits(page: Page) {
  expect(
    (
      await page.request.patch('/api/settings/storage', {
        headers: await headers(page),
        data: storageLimitsFrom(DEFAULT_SETTINGS),
      })
    ).status(),
  ).toBe(200);
}
async function pending(page: Page) {
  const bytes = Buffer.from(`Synthetic unused ${randomUUID()}`),
    id = randomUUID();
  const result = await page.request.post('/api/uploads', {
    headers: await headers(page),
    data: {
      mutationId: randomUUID(),
      requestDigest: 'a'.repeat(64),
      items: [
        {
          id,
          filename: 'unused-香港.txt',
          incomingBytes: bytes.length,
          incomingDigest: createHash('sha256').update(bytes).digest('hex'),
        },
      ],
    },
  });
  expect(result.status()).toBe(200);
  const batchId = (await result.json()).data.batch.id;
  const upload = await page.request.put(`/api/uploads/${batchId}/${id}`, {
    headers: {
      ...(await headers(page)),
      'content-type': 'application/octet-stream',
    },
    data: bytes,
  });
  expect(upload.status()).toBe(200);
  return { batchId, id };
}
function simulateQueuedCrash(batchId: string, attachmentId: string) {
  const data = readdirSync('.e2e-data').find((entry) =>
    entry.startsWith('run-'),
  )!;
  const db = new Database(join('.e2e-data', data, 'db/pandanote.sqlite'));
  try {
    // Synthetic fault fixture: the queue transaction committed, but no worker
    // ran before interruption. All subsequent measurement/deletion uses HTTP.
    db.transaction(() => {
      db.prepare("update upload_batches set status='abandoned' where id=?").run(
        batchId,
      );
      db.prepare(
        "insert into file_cleanup_jobs(id,attachment_id,state,attempts,created_at,updated_at) values(?,?,'pending',0,?,?)",
      ).run(randomUUID(), attachmentId, Date.now(), Date.now());
    })();
  } finally {
    db.close();
  }
}
function age(id: string) {
  const data = readdirSync('.e2e-data').find((entry) =>
    entry.startsWith('run-'),
  )!;
  const db = new Database(join('.e2e-data', data, 'db/pandanote.sqlite'));
  try {
    db.prepare('update upload_batches set activity_at=? where id=?').run(
      Date.now() - UNUSED_UPLOAD_QUIET_MS - 10_000,
      id,
    );
  } finally {
    db.close();
  }
}

test('location stays local, validates and survives reload; denied permission never blocks posting; explicit popover copy/map/remove', async ({
  page,
  context,
}, info) => {
  let calls = 0;
  await page.exposeFunction('recordGeoCall', () => {
    calls++;
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (_ok: unknown, failure: (error: { code: number }) => void) => {
        void (
          window as unknown as { recordGeoCall: () => Promise<void> }
        ).recordGeoCall();
        failure({ code: 1 });
      },
    });
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (text: string) => {
        (window as unknown as { copiedLocation: string }).copiedLocation = text;
      },
    });
  });
  const text = `S15 manual ${randomUUID()}`;
  let uploads = 0;
  page.on('request', (request) => {
    if (
      request.url().includes('/api/uploads') ||
      (request.url().includes('/api/notes') && request.method() !== 'GET')
    )
      uploads++;
  });
  await start(page, text);
  expect(calls).toBe(0);
  await composer(page)
    .getByRole('button', { name: 'Add note options' })
    .click();
  await composer(page)
    .getByRole('button', { name: 'Add location', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Note location',
    exact: true,
  });
  expect(calls).toBe(0);
  await dialog.getByRole('button', { name: 'Use current location' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'permission was denied',
  );
  await dialog.getByLabel('Latitude', { exact: true }).fill('91');
  await dialog.getByLabel('Longitude', { exact: true }).fill('114.1');
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('−90 to 90');
  await dialog.getByLabel('Latitude', { exact: true }).fill('22.3');
  await dialog.getByLabel('Location label (optional)').fill('香港 notebook');
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (await records(page)).find((draft) => draft.bodyMarkdown === text)
          ?.location,
    )
    .toEqual({
      latitude: 22.3,
      longitude: 114.1,
      accuracy: null,
      label: '香港 notebook',
    });
  expect(uploads).toBe(0);
  await page.reload();
  await composer(page).getByRole('button', { name: 'Write a note…' }).click();
  await composer(page)
    .getByRole('button', { name: 'Add note options' })
    .click();
  await expect(
    composer(page).getByRole('button', { name: 'Edit location' }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  expect(calls).toBe(1);
  await composer(page)
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(composer(page).locator('span[role="status"]')).toContainText(
    'Saved on server.',
  );
  await page.goto(`/?q=${encodeURIComponent(text)}`);
  const card = page.locator('[data-note-id]').filter({ hasText: text });
  await expect(card).toHaveCount(1);
  let mapCalls = 0;
  await context.route('https://www.openstreetmap.org/**', async (route) => {
    mapCalls++;
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<p>Synthetic map destination</p>',
    });
  });
  expect(mapCalls).toBe(0);
  await card
    .getByRole('button', { name: 'Location: 香港 notebook', exact: true })
    .click();
  const popup = page.getByRole('dialog', {
    name: 'Location details',
    exact: true,
  });
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('22.3, 114.1');
  await expect(popup).not.toContainText('Reported accuracy');
  await popup.getByRole('button', { name: 'Copy coordinates' }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedLocation: string }).copiedLocation,
    ),
  ).toBe('22.3, 114.1');
  expect(mapCalls).toBe(0);
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, 'writeText', {
      value: async () => {
        throw new Error('Synthetic denied clipboard');
      },
    }),
  );
  await popup.getByRole('button', { name: 'Copy coordinates' }).click();
  await expect(popup.getByRole('status')).toContainText('Could not copy');
  await page.screenshot({ path: info.outputPath('location-popover.png') });
  const [external] = await Promise.all([
    context.waitForEvent('page'),
    popup.getByRole('link', { name: 'Open map' }).click(),
  ]);
  await external.waitForLoadState();
  expect(mapCalls).toBe(1);
  await external.close();
  await popup.getByRole('button', { name: 'Close location' }).click();
  await card.getByRole('link', { name: 'Open note', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Note detail', exact: true });
  await detail
    .getByRole('button', { name: 'Location: 香港 notebook', exact: true })
    .click();
  await expect(popup).toBeVisible();
  await popup.getByRole('button', { name: 'Close location' }).click();
  await detail.getByRole('button', { name: 'Edit note', exact: true }).click();
  await composer(page)
    .getByRole('button', { name: 'Add note options' })
    .click();
  await composer(page).getByRole('button', { name: 'Edit location' }).click();
  await dialog.getByRole('button', { name: 'Remove location' }).click();
  await composer(page)
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(composer(page).locator('span[role="status"]')).toContainText(
    'Saved on server.',
  );
  await page.goto(`/?q=${encodeURIComponent(text)}`);
  await expect(card.getByRole('button', { name: /^Location:/ })).toHaveCount(0);
});

test('explicit native browser location preserves accuracy; manual coordinate edits clear it; canceled late callbacks cannot mutate drafts', async ({
  page,
  context,
}) => {
  await context.setGeolocation({
    latitude: 35.6,
    longitude: 139.7,
    accuracy: 12,
  });
  await context.grantPermissions(['geolocation'], { origin });
  const text = `S15 current ${randomUUID()}`;
  await start(page, text);
  expect(
    (await records(page)).find((draft) => draft.bodyMarkdown === text)
      ?.location,
  ).toBeNull();
  await composer(page)
    .getByRole('button', { name: 'Add note options' })
    .click();
  await composer(page).getByRole('button', { name: 'Add location' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Note location',
    exact: true,
  });
  await dialog.getByRole('button', { name: 'Use current location' }).click();
  await expect(dialog.getByLabel('Latitude', { exact: true })).toHaveValue(
    '35.6',
  );
  await expect(dialog).toContainText('Reported accuracy: 12 m');
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await records(page)).find((draft) => draft.bodyMarkdown === text)
          ?.location?.accuracy,
    )
    .toBe(12);
  await composer(page)
    .getByRole('button', { name: 'Add note options' })
    .click();
  await composer(page).getByRole('button', { name: 'Edit location' }).click();
  await dialog.getByLabel('Longitude', { exact: true }).fill('140');
  await expect(dialog).toContainText(
    'Manual coordinates have no reported accuracy',
  );
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await records(page)).find((draft) => draft.bodyMarkdown === text)
          ?.location?.accuracy,
    )
    .toBeNull();
  await page.evaluate(() =>
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      configurable: true,
      value: (ok: (position: unknown) => void) => {
        (window as unknown as { lateGeo: () => void }).lateGeo = () =>
          ok({ coords: { latitude: 1, longitude: 1, accuracy: 1 } });
      },
    }),
  );
  await composer(page)
    .getByRole('button', { name: 'Add note options' })
    .click();
  await composer(page).getByRole('button', { name: 'Edit location' }).click();
  await dialog.getByRole('button', { name: 'Use current location' }).click();
  await dialog.getByRole('button', { name: 'Close Note location' }).click();
  await page.evaluate(() =>
    (window as unknown as { lateGeo: () => void }).lateGeo(),
  );
  expect(
    (await records(page)).find((draft) => draft.bodyMarkdown === text)
      ?.location,
  ).toEqual({ latitude: 35.6, longitude: 140, accuracy: null, label: null });
});

test('mobile manual location dialog, zero coordinates and timeout allow posting without location', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await browserSession(page);
  await page.goto('/drafts');
  await page
    .getByRole('button', { name: 'Create another draft', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Write a note',
    exact: true,
  });
  await editor
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('S15 mobile without location');
  await page.evaluate(() =>
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', {
      value: (_ok: unknown, fail: (error: { code: number }) => void) =>
        fail({ code: 3 }),
    }),
  );
  await editor.getByRole('button', { name: 'Add note options' }).click();
  await editor.getByRole('button', { name: 'Add location' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Note location',
    exact: true,
  });
  await dialog.getByRole('button', { name: 'Use current location' }).click();
  await expect(dialog.getByRole('alert')).toContainText('timed out');
  await dialog.getByLabel('Latitude', { exact: true }).fill('0');
  await dialog.getByLabel('Longitude', { exact: true }).fill('0');
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  await editor.getByRole('button', { name: 'Add note options' }).click();
  await editor.getByRole('button', { name: 'Edit location' }).click();
  await page.screenshot({ path: info.outputPath('mobile-location.png') });
  await dialog.getByRole('button', { name: 'Remove location' }).click();
  await editor.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(editor.locator('span[role="status"]')).toContainText(
    'Saved on server.',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('storage settings persist across devices, retain failed choices, reject injection/auth/CSRF and enforce limits at the real server', async ({
  page,
  browser,
}, info) => {
  await browserSession(page);
  await resetLimits(page);
  try {
    await page.goto('/settings');
    await expect(
      page.getByRole('button', { name: 'Refresh storage', exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText('Filesystem free space', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('Display image maximum edge (px)').fill('1280');
    await page.getByLabel('Display WebP quality').fill('80');
    await page.route('**/api/settings/storage', async (route) => {
      if (route.request().method() === 'PATCH') await route.abort();
      else await route.continue();
    });
    await page.getByRole('button', { name: 'Save storage limits' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Your choices remain' }),
    ).toBeVisible();
    await expect(
      page.getByLabel('Display image maximum edge (px)'),
    ).toHaveValue('1280');
    await page.unrouteAll({ behavior: 'wait' });
    await page.getByRole('button', { name: 'Save storage limits' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Storage limits saved' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel('Display image maximum edge (px)'),
    ).toHaveValue('1280');
    const other = await browser.newContext();
    try {
      const tab = await other.newPage();
      await browserSession(tab);
      await tab.goto('/settings');
      await expect(tab.getByLabel('Display WebP quality')).toHaveValue('80');
    } finally {
      await other.close();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('button', { name: 'Save storage limits' })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('mobile-storage.png') });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const h = await headers(page),
      defaults = storageLimitsFrom(DEFAULT_SETTINGS);
    expect(
      (
        await page.request.patch('/api/settings/storage', {
          headers: { ...h, origin: 'https://attacker.invalid' },
          data: defaults,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.patch('/api/settings/storage', {
          headers: h,
          data: { ...defaults, dataDir: '/public' },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.patch('/api/settings/storage', {
          headers: h,
          data: { ...defaults, imageMaxPixels: 50_000_001 },
        })
      ).status(),
    ).toBe(400);
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.get(origin + '/api/settings/storage')
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
    expect(
      (
        await page.request.patch('/api/settings/storage', {
          headers: h,
          data: { ...defaults, fileMaxBytes: 1024, markdownMaxBytes: 1024 },
        })
      ).status(),
    ).toBe(200);
    const bytes = Buffer.alloc(1025, 'x'),
      id = randomUUID();
    const initialized = await page.request.post('/api/uploads', {
      headers: h,
      data: {
        mutationId: randomUUID(),
        requestDigest: 'a'.repeat(64),
        items: [
          {
            id,
            filename: 'too-large.txt',
            incomingBytes: bytes.length,
            incomingDigest: createHash('sha256').update(bytes).digest('hex'),
          },
        ],
      },
    });
    const batchId = (await initialized.json()).data.batch.id;
    expect(
      (
        await page.request.put(`/api/uploads/${batchId}/${id}`, {
          headers: { ...h, 'content-type': 'application/octet-stream' },
          data: bytes,
        })
      ).status(),
    ).toBe(400);
    await page.setViewportSize({ width: 1440, height: 900 });
    await start(page, 'S15 local limit check');
    await page.getByLabel('Choose local files').setInputFiles({
      name: 'too-large.txt',
      mimeType: 'text/plain',
      buffer: bytes,
    });
    await expect(composer(page).getByRole('alert')).toContainText(
      'saved upload limit',
    );
    expect(
      (await records(page)).find(
        (draft) => draft.bodyMarkdown === 'S15 local limit check',
      )?.attachments,
    ).toEqual([]);
    expect(
      (
        await page.request.post('/api/notes', {
          headers: h,
          data: {
            action: 'create',
            mutationId: randomUUID(),
            content: {
              bodyMarkdown: 'x'.repeat(1025),
              timelineAt: null,
              location: null,
              attachmentIds: [],
            },
          },
        })
      ).status(),
    ).toBe(400);
  } finally {
    await resetLimits(page);
  }
});

test('storage can explicitly retry durable queued deletion after an interrupted worker, with confirmation and safe errors', async ({
  page,
}) => {
  const a = await pending(page);
  simulateQueuedCrash(a.batchId, a.id);
  await page.goto('/settings');
  const retry = page.getByRole('button', {
    name: 'Retry queued cleanup',
    exact: true,
  });
  await expect(retry).toBeEnabled();
  expect(
    (
      await page.request.post('/api/settings/storage/cleanup', {
        headers: await headers(page),
        data: { retryQueued: true, confirmed: false },
      })
    ).status(),
  ).toBe(400);
  await retry.click();
  const dialog = page.getByRole('dialog', {
    name: 'Clean unused uploads',
    exact: true,
  });
  await expect(dialog).toContainText('already confirmed and queued');
  await dialog.getByRole('button', { name: 'Confirm cleanup' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Queued cleanup finished' }),
  ).toBeVisible();
  await expect(retry).toHaveCount(0);
  expect(
    (
      await page.request.get(`/api/attachments/${a.id}/file`, {
        headers: await headers(page),
      })
    ).status(),
  ).toBe(404);
});

test('location storage failure retains editor metadata, reports unsaved state, and retries without losing text', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key.includes(':record:') &&
        document.documentElement.dataset.failLocation === 'true'
      )
        throw new DOMException('Synthetic full storage', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  const text = `S15 quota ${randomUUID()}`;
  await start(page, text);
  await composer(page)
    .getByRole('button', { name: 'Add note options' })
    .click();
  await composer(page).getByRole('button', { name: 'Add location' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Note location',
    exact: true,
  });
  await dialog.getByLabel('Latitude', { exact: true }).fill('0');
  await dialog.getByLabel('Longitude', { exact: true }).fill('0');
  await page.evaluate(() => {
    document.documentElement.dataset.failLocation = 'true';
  });
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'could not be saved on this device',
  );
  expect(
    (await records(page)).find((draft) => draft.bodyMarkdown === text)
      ?.location,
  ).toBeNull();
  await page.evaluate(() => {
    document.documentElement.dataset.failLocation = 'false';
  });
  await dialog
    .getByRole('button', { name: 'Save location', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await records(page)).find((draft) => draft.bodyMarkdown === text)
      ?.location,
  ).toEqual({ latitude: 0, longitude: 0, accuracy: null, label: null });
  await expect(
    composer(page).getByRole('textbox', { name: 'Note text', exact: true }),
  ).toHaveValue(text);
});

test('storage cleanup is confirmed/activity-bound, protects recent retries and keeps local work while deleting only abandoned server bytes', async ({
  page,
}, info) => {
  await start(page, 'S15 retained local cleanup text');
  const a = await pending(page);
  await page.goto('/settings');
  await expect(
    page.getByRole('button', { name: 'Refresh storage', exact: true }),
  ).toBeEnabled();
  let row = page
    .locator('.attempts li')
    .filter({ hasText: 'unused-香港.txt' })
    .last();
  await expect(
    row.getByRole('button', { name: 'Clean unused attempt' }),
  ).toBeDisabled();
  age(a.batchId);
  await page
    .getByRole('button', { name: 'Refresh storage', exact: true })
    .click();
  row = page
    .locator('.attempts li')
    .filter({ hasText: 'unused-香港.txt' })
    .first();
  await expect(
    row.getByRole('button', { name: 'Clean unused attempt' }),
  ).toBeEnabled();
  await row.getByRole('button', { name: 'Clean unused attempt' }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Clean unused uploads',
    exact: true,
  });
  await expect(dialog).toContainText('cannot be undone');
  expect(
    (
      await page.request.get(`/api/attachments/${a.id}/file`, {
        headers: await headers(page),
      })
    ).status(),
  ).toBe(200);
  await page.screenshot({ path: info.outputPath('cleanup-confirmation.png') });
  await dialog.getByRole('button', { name: 'Confirm cleanup' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Unused attempt cleaned' }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(`/api/attachments/${a.id}/file`, {
        headers: await headers(page),
      })
    ).status(),
  ).toBe(404);
  expect(
    (await records(page)).some(
      (draft) => draft.bodyMarkdown === 'S15 retained local cleanup text',
    ),
  ).toBe(true);
});
