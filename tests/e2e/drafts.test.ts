import { browserSession } from '../helpers/browser-session.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  chromium,
  expect,
  test,
  type Page,
  type Cookie,
} from '@playwright/test';
import type { LocalDraft } from '../../src/lib/client/drafts/model.ts';
const origin = 'http://127.0.0.1:4173';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2xoAAAAASUVORK5CYII=',
  'base64',
);
// Reuse only an actual server-issued test session across independent browser
// profiles. Do not weaken production's 10-login/IP limit for a larger suite.
let sessionCookies: Cookie[] = [];
async function signIn(page: Page) {
  const session = sessionCookies.find(
    (cookie) => cookie.name === 'pandanote_session',
  );
  if (session) {
    const probe = await page.request.get(`${origin}/api/auth/security`, {
      headers: { cookie: `pandanote_session=${session.value}` },
    });
    if (probe.ok()) {
      await page.context().addCookies(sessionCookies);
      return;
    }
  }
  sessionCookies = await browserSession(page);
}
async function records(page: Page): Promise<LocalDraft[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.includes(':record:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .filter((draft) => !draft.deleted),
  );
}
async function bytes(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('pandanote-draft-blobs', 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const rows = await new Promise<
      { accountId: string; draftId: string; attachmentId: string; blob: Blob }[]
    >((resolve, reject) => {
      const tx = db.transaction('blobs');
      const request = tx.objectStore('blobs').getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return Promise.all(
      rows.map(async (row) => ({
        accountId: row.accountId,
        draftId: row.draftId,
        id: row.attachmentId,
        bytes: Array.from(new Uint8Array(await row.blob.arrayBuffer())),
      })),
    );
  });
}
async function write(page: Page, text: string) {
  await page.getByRole('textbox', { name: 'Note text' }).fill(text);
  await expect(page.getByTestId('composer').getByRole('status')).toHaveText(
    'Saved on this device.',
  );
}
async function attach(page: Page) {
  await page.getByLabel('Choose local files').setInputFiles([
    { name: 'quiet.png', mimeType: 'image/png', buffer: png },
    {
      name: '香港.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('unchanged file bytes 香港'),
    },
  ]);
  await expect
    .poll(async () =>
      (await records(page)).some((record) => record.attachments.length === 2),
    )
    .toBe(true);
  await expect(
    page.getByRole('button', { name: 'Add files' }).first(),
  ).toBeEnabled();
}

test('local drafts recover independently with identical blobs, rebuild their index, and discard only the confirmed draft', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await write(page, 'First 香港 draft');
  await attach(page);
  const first = (await records(page))[0];
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await write(page, 'Second 図書館 draft');
  await attach(page);
  const before = await records(page);
  const beforeBytes = await bytes(page);
  expect(before).toHaveLength(2);
  expect(beforeBytes).toHaveLength(4);
  expect(
    beforeBytes.filter((row) => row.bytes.join() === Array.from(png).join()),
  ).toHaveLength(2);
  expect(
    beforeBytes.filter(
      (row) =>
        Buffer.from(row.bytes).toString() === 'unchanged file bytes 香港',
    ),
  ).toHaveLength(2);
  await page.evaluate(() => {
    const index = Object.keys(localStorage).find((key) =>
      key.endsWith(':index'),
    )!;
    localStorage.setItem(index, '{broken');
  });
  await page.reload();
  await expect(page.getByTestId('local-draft')).toHaveCount(2);
  expect(await records(page)).toEqual(before);
  expect(await bytes(page)).toEqual(beforeBytes);
  for (const record of before) {
    await page
      .locator(`[data-draft-id="${record.localDraftId}"]`)
      .getByRole('button', { name: /^Resume/ })
      .click();
    await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveValue(
      record.bodyMarkdown,
    );
  }
  const row = page.locator(`[data-draft-id="${first.localDraftId}"]`);
  await row.getByRole('button', { name: /^Discard/ }).click();
  await expect(
    page.getByRole('dialog', { name: 'Discard local draft?' }),
  ).toBeVisible();
  expect(await records(page)).toHaveLength(2);
  await page.getByRole('button', { name: 'Confirm discard' }).click();
  await expect(page.getByTestId('local-draft')).toHaveCount(1);
  expect(
    (await bytes(page)).every((entry) => entry.draftId !== first.localDraftId),
  ).toBe(true);
  expect(await records(page)).toEqual(
    before.filter((draft) => draft.localDraftId !== first.localDraftId),
  );
});

test('local selection, paste, drop, autosave and preview send no draft/upload requests and revoke blob URLs', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    const created: string[] = [];
    const revoked: string[] = [];
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      created.push(url);
      document.documentElement.dataset.createdUrls = JSON.stringify(created);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
      document.documentElement.dataset.revokedUrls = JSON.stringify(revoked);
      revoke(url);
    };
  });
  await signIn(page);
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()))
      mutations.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await write(page, 'Local only');
  await attach(page);
  const text = page.getByRole('textbox', { name: 'Note text' });
  await text.evaluate((node) => {
    (node as HTMLTextAreaElement).setSelectionRange(0, 0);
    const data = new DataTransfer();
    data.items.add(
      new File(['pasted bytes'], 'paste.txt', { type: 'text/plain' }),
    );
    node.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect
    .poll(async () => (await records(page))[0].attachments.length)
    .toBe(3);
  await expect(
    page.getByRole('button', { name: 'Add files' }).first(),
  ).toBeEnabled();
  await text.evaluate((node) => {
    const data = new DataTransfer();
    data.items.add(
      new File(['drop bytes'], 'drop.txt', { type: 'text/plain' }),
    );
    node.dispatchEvent(
      new DragEvent('drop', {
        dataTransfer: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect
    .poll(async () => (await records(page))[0].attachments.length)
    .toBe(4);
  await text.press('End');
  await text.press('Enter');
  await text.press('Control+Enter');
  await text.press('Meta+Enter');
  await expect(text).toHaveValue(/\n/);
  await page
    .getByRole('button', { name: 'Preview', exact: true })
    .first()
    .click();
  await expect(page.locator('.compact-preview img')).toBeVisible();
  expect(
    await page
      .locator('.compact-preview img')
      .evaluate((image) => (image as HTMLImageElement).naturalWidth),
  ).toBe(1);
  await page
    .getByRole('button', { name: 'Write', exact: true })
    .first()
    .click();
  const urlState = await page.evaluate(() => ({
    created: JSON.parse(
      document.documentElement.dataset.createdUrls ?? '[]',
    ) as string[],
    revoked: JSON.parse(
      document.documentElement.dataset.revokedUrls ?? '[]',
    ) as string[],
    storage: JSON.stringify(localStorage),
  }));
  expect(urlState.created.length).toBeGreaterThan(0);
  expect(urlState.created.every((url) => urlState.revoked.includes(url))).toBe(
    true,
  );
  expect(urlState.storage).not.toContain('blob:');
  await expect(
    page.getByRole('button', { name: 'Post', exact: true }).first(),
  ).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('local text/blob quota failures and denied persistence are visible without false saved references', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key.includes(':record:') &&
        document.documentElement.dataset.failText === 'true'
      )
        throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, key, value);
    };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (document.documentElement.dataset.failBlob === 'true')
        throw new DOMException('full', 'QuotaExceededError');
      return put.apply(this, args);
    };
    if (navigator.storage) navigator.storage.persist = async () => false;
  });
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.failText = 'true';
  });
  await page.getByRole('textbox', { name: 'Note text' }).fill('Keep this text');
  await expect(page.getByRole('alert')).toContainText('not saved');
  expect(await records(page)).toEqual([]);
  await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    'Keep this text',
  );
  await page.evaluate(() => {
    document.documentElement.dataset.failText = 'false';
  });
  await page.getByRole('button', { name: 'Retry saving locally' }).click();
  await expect(page.getByTestId('composer').getByRole('status')).toHaveText(
    'Saved on this device.',
  );
  await page.evaluate(() => {
    document.documentElement.dataset.failBlob = 'true';
  });
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'quota.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('keep original'),
  });
  await expect(page.getByRole('alert')).toContainText('storage failed');
  expect((await records(page))[0].attachments).toEqual([]);
  await page.evaluate(() => {
    document.documentElement.dataset.failBlob = 'false';
  });
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'quota.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('keep original'),
  });
  await expect
    .poll(async () => (await records(page))[0].attachments.length)
    .toBe(1);
  await page
    .getByRole('button', { name: 'Request persistent storage' })
    .click();
  await expect(
    page.getByText('Persistent storage was not granted.', { exact: false }),
  ).toBeVisible();
});

test('missing local blobs require visible repair/removal and broken references never look ready', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await attach(page);
  const draft = (await records(page))[0];
  const image = draft.attachments.find((item) => item.kind === 'image')!;
  await page.evaluate(
    async ({ accountId, draftId, id }) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('pandanote-draft-blobs', 1);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete([accountId, draftId, id]);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { accountId: draft.accountId, draftId: draft.localDraftId, id: image.id },
  );
  await page.reload();
  await page.getByRole('button', { name: /^Resume/ }).click();
  await page
    .getByTestId('composer')
    .getByText('Attachments (2) — missing files', { exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Missing file');
  await page
    .getByTestId('composer')
    .getByLabel('Repair quiet.png')
    .setInputFiles({ name: 'quiet.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByTestId('composer')).not.toContainText('Missing file');
  expect((await bytes(page)).find((row) => row.id === image.id)?.bytes).toEqual(
    Array.from(png),
  );
  await page.getByRole('button', { name: 'Remove quiet.png' }).click();
  await expect
    .poll(async () => (await records(page))[0].attachments.length)
    .toBe(1);
  expect((await records(page))[0].bodyMarkdown).not.toContain(
    `attachment:${image.id}`,
  );
  await expect.poll(async () => (await bytes(page)).length).toBe(1);
});

test('two tabs keep losing text and blobs, offer a separate draft, and never overwrite or resurrect a discarded revision', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await write(page, 'Original');
  await attach(page);
  const original = (await records(page))[0];
  const second = await context.newPage();
  await second.goto(origin + '/drafts');
  await second.getByRole('button', { name: /^Resume/ }).click();
  await write(page, 'Winning edit');
  await expect(second.getByRole('alert')).toContainText('another tab');
  await second
    .getByRole('textbox', { name: 'Note text' })
    .fill('Losing edit to keep');
  await expect(second.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    'Losing edit to keep',
  );
  expect((await records(page))[0].bodyMarkdown).toBe('Winning edit');
  await second
    .getByRole('button', { name: 'Save my version as another draft' })
    .click();
  await expect.poll(async () => (await records(page)).length).toBe(2);
  expect(
    (await records(page)).map((draft) => draft.bodyMarkdown).sort(),
  ).toEqual(['Losing edit to keep', 'Winning edit']);
  expect(await bytes(page)).toHaveLength(4);
  // The other tab reopens the original before it is discarded.
  await second
    .locator(`[data-draft-id="${original.localDraftId}"]`)
    .getByRole('button', { name: /^Resume/ })
    .click();
  await page
    .locator(`[data-draft-id="${original.localDraftId}"]`)
    .getByRole('button', { name: /^Discard/ })
    .click();
  await page.getByRole('button', { name: 'Confirm discard' }).click();
  await expect(second.getByRole('alert')).toContainText('discarded');
  await second
    .getByRole('textbox', { name: 'Note text' })
    .fill('Do not resurrect');
  await second
    .getByRole('button', { name: 'Load saved version', exact: true })
    .click();
  await second
    .getByRole('button', { name: 'Confirm load saved version' })
    .click();
  expect(await records(page)).toHaveLength(1);
  expect((await records(page))[0].localDraftId).not.toBe(original.localDraftId);
  await second.close();
});

test('signout hides draft UI but preserves browser data, and sign-in recovers it', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await write(page, 'Retain across signout');
  await attach(page);
  const saved = await records(page);
  const savedBytes = await bytes(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByTestId('composer')).toHaveCount(0);
  expect(await records(page)).toEqual(saved);
  expect(await bytes(page)).toEqual(savedBytes);
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: /^Resume/ }).click();
  await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    saved[0].bodyMarkdown,
  );
});

test('browser process restart retains local draft text and binary files on that profile', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'pandanote-draft-restart-'));
  let context = await chromium.launchPersistentContext(profile);
  try {
    let page = await context.newPage();
    await signIn(page);
    await page.goto(origin + '/drafts');
    await page.getByRole('button', { name: 'Create another draft' }).click();
    await write(page, 'Browser restart recovery');
    await attach(page);
    const saved = await records(page);
    const savedBytes = await bytes(page);
    await context.close();
    context = await chromium.launchPersistentContext(profile);
    page = await context.newPage();
    await signIn(page);
    await page.goto(origin + '/drafts');
    await expect(page.getByTestId('local-draft')).toHaveCount(1);
    expect(await records(page)).toEqual(saved);
    expect(await bytes(page)).toEqual(savedBytes);
    await page.getByRole('button', { name: /^Resume/ }).click();
    await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveValue(
      saved[0].bodyMarkdown,
    );
  } finally {
    await context.close();
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 30,
      retryDelay: 200,
    });
  }
});

test('IndexedDB transaction abort and post-blob text quota failures never commit successful references', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const result = put.apply(this, args);
      if (document.documentElement.dataset.abortBlob === 'true')
        result.addEventListener('success', () => this.transaction.abort());
      return result;
    };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key.includes(':record:') &&
        document.documentElement.dataset.failText === 'true'
      )
        throw new DOMException('full', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await write(page, 'Keep committed text');
  await page.evaluate(() => {
    document.documentElement.dataset.abortBlob = 'true';
  });
  const file = {
    name: 'atomic.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('original bytes'),
  };
  await page.getByLabel('Choose local files').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('file storage failed');
  expect((await records(page))[0].attachments).toEqual([]);
  expect(await bytes(page)).toEqual([]);
  await page.evaluate(() => {
    document.documentElement.dataset.abortBlob = 'false';
    document.documentElement.dataset.failText = 'true';
  });
  await page.getByLabel('Choose local files').setInputFiles(file);
  await expect(page.getByRole('alert')).toContainText('not saved');
  expect((await records(page))[0].attachments).toEqual([]);
  // The completed blob write is an orphan, not a successful attachment; the
  // product reconciliation removes it without touching the committed text.
  await expect.poll(async () => (await bytes(page)).length).toBe(0);
  await page.evaluate(() => {
    document.documentElement.dataset.failText = 'false';
  });
  await page.reload();
  await page.getByRole('button', { name: /^Resume/ }).click();
  await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    'Keep committed text',
  );
});

test('account scope and unsupported records are preserved during browser reconciliation, never silently reset', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await write(page, 'Own account draft');
  await attach(page);
  const own = (await records(page))[0];
  const foreign = {
    ...own,
    accountId: '22222222-2222-4222-8222-222222222222',
    localDraftId: '33333333-3333-4333-8333-333333333333',
    bodyMarkdown: 'Other account private text',
  };
  await page.evaluate((draft) => {
    localStorage.setItem(
      `pandanote:drafts:v1:${draft.accountId}:record:${draft.localDraftId}`,
      JSON.stringify(draft),
    );
  }, foreign);
  await page.reload();
  await expect(page.getByTestId('local-draft')).toHaveCount(1);
  await expect(page.locator('#notes-pane')).not.toContainText(
    'Other account private text',
  );
  await page.evaluate((draft) => {
    const key = `pandanote:drafts:v1:${draft.accountId}:record:${draft.localDraftId}`;
    localStorage.setItem(key, JSON.stringify({ ...draft, schemaVersion: 99 }));
  }, own);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText(
    'unsupported storage version',
  );
  expect(
    await page.evaluate(
      (draft) =>
        JSON.parse(
          localStorage.getItem(
            `pandanote:drafts:v1:${draft.accountId}:record:${draft.localDraftId}`,
          )!,
        ).schemaVersion,
      own,
    ),
  ).toBe(99);
  expect(await bytes(page)).toHaveLength(2);
});

test('unsupported cross-tab locking fails visibly rather than pretending text is safely saved', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { value: undefined });
  });
  await signIn(page);
  await page.goto('/drafts');
  await expect(page.getByRole('alert')).toContainText('Web Locks');
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await page
    .getByRole('textbox', { name: 'Note text' })
    .fill('Keep outside this browser');
  await expect(page.getByRole('alert')).toContainText('not supported');
  expect(await records(page)).toEqual([]);
  await expect(
    page.getByTestId('composer').getByRole('status'),
  ).not.toContainText('Saved on this device');
});

test('mobile local-file picker, recovery, and keyboard-shrunken editor keep saved text and reachable actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  const editor = page.getByRole('dialog', {
    name: 'Write a note',
    exact: true,
  });
  await expect(editor).toBeVisible();
  await editor
    .getByRole('textbox', { name: 'Note text' })
    .fill('Mobile local recovery');
  const chooser = page.waitForEvent('filechooser');
  await editor.getByRole('button', { name: 'Add files' }).click();
  await (
    await chooser
  ).setFiles([{ name: 'quiet.png', mimeType: 'image/png', buffer: png }]);
  await expect(editor.getByRole('button', { name: 'Add files' })).toBeEnabled();
  await expect(editor.getByRole('status')).toHaveText('Saved on this device.');
  const saved = (await records(page))[0];
  await page.setViewportSize({ width: 390, height: 260 });
  const geometry = await editor
    .getByRole('textbox', { name: 'Note text' })
    .boundingBox();
  expect(geometry!.height).toBeGreaterThanOrEqual(24);
  for (const name of ['Close Write a note', 'Post', 'Add files']) {
    const bounds = await editor
      .getByRole('button', { name, exact: true })
      .boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(260);
  }
  await editor.getByRole('button', { name: 'Close Write a note' }).click();
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /^Resume/ }).click();
  await expect(editor.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    saved.bodyMarkdown,
  );
  await editor.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(editor.locator('img')).toBeVisible();
});

test('a tab conflict with evicted files still preserves losing text as a separate repairable draft', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.goto('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await write(page, 'Original text');
  await attach(page);
  const original = (await records(page))[0];
  const second = await context.newPage();
  await second.goto(origin + '/drafts');
  await second.getByRole('button', { name: /^Resume/ }).click();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('pandanote-draft-blobs', 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').clear();
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await write(page, 'Winner still saved');
  await expect(second.getByRole('alert')).toContainText('another tab');
  const losing = original.bodyMarkdown + '\nLosing edits with missing files';
  await second.getByRole('textbox', { name: 'Note text' }).fill(losing);
  await second
    .getByRole('button', { name: 'Save my version as another draft' })
    .click();
  await expect(
    second.getByTestId('composer').getByRole('status'),
  ).toContainText('Missing files need repair');
  expect((await records(page)).map((draft) => draft.bodyMarkdown)).toEqual(
    expect.arrayContaining(['Winner still saved', losing]),
  );
  await second
    .getByTestId('composer')
    .getByText('Attachments (2) — missing files', { exact: true })
    .click();
  await expect(second.getByTestId('composer').getByRole('alert')).toHaveCount(
    2,
  );
  await second
    .getByTestId('composer')
    .getByLabel('Repair quiet.png')
    .setInputFiles({ name: 'quiet.png', mimeType: 'image/png', buffer: png });
  await expect.poll(async () => (await bytes(second)).length).toBe(1);
  await expect(second.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    losing,
  );
  await second.close();
});
