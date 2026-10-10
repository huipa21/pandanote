import { createHash, randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { expect, test, type Cookie, type Page } from '@playwright/test';
import type { LocalDraft } from '../../src/lib/client/drafts/model.ts';
import type { NoteSnapshot } from '../../src/lib/shared/domain.ts';
import { canonicalNoteSnapshot } from '../../src/lib/shared/notes.ts';
import { browserSession } from '../helpers/browser-session.ts';
const origin = 'http://127.0.0.1:4173';
test.use({ hasTouch: true });
let cookies: Cookie[] = [];
let initialCards = 0;
async function signIn(page: Page) {
  cookies = await browserSession(page);
}
function headers() {
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
      .filter((d) => !d.deleted),
  );
}
async function blobCount(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('pandanote-draft-blobs', 1);
      request.onsuccess = () => resolve(request.result);
    });
    const count = await new Promise<number>((resolve) => {
      const tx = db.transaction('blobs');
      const request = tx.objectStore('blobs').count();
      tx.oncomplete = () => resolve(request.result);
    });
    db.close();
    return count;
  });
}
function receiptCount(mutationId: string) {
  const data = readdirSync('.e2e-data').find((entry) =>
    entry.startsWith('run-'),
  )!;
  const db = new Database(join('.e2e-data', data, 'db/pandanote.sqlite'), {
    readonly: true,
  });
  try {
    return (
      db
        .prepare(
          'SELECT count(*) AS n FROM mutation_receipts WHERE mutation_id = ?',
        )
        .get(mutationId) as { n: number }
    ).n;
  } finally {
    db.close();
  }
}
async function start(page: Page, text: string) {
  await signIn(page);
  await page.goto('/');
  initialCards = await page.getByTestId('posted-note').count();
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await page.getByRole('textbox', { name: 'Note text' }).fill(text);
  await expect(page.getByTestId('composer').getByRole('status')).toHaveText(
    'Saved on this device.',
  );
}
async function attach(page: Page) {
  const image = await sharp({
    create: { width: 64, height: 32, channels: 3, background: 'green' },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const png = await sharp({
    create: { width: 20, height: 10, channels: 4, background: '#22884488' },
  })
    .png()
    .toBuffer();
  await page.getByLabel('Choose local files').setInputFiles([
    {
      name: 'oriented.txt',
      mimeType: 'application/octet-stream',
      buffer: image,
    },
    { name: 'quiet.png', mimeType: 'image/png', buffer: png },
    {
      name: '香港.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('exact file bytes 香港'),
    },
  ]);
  await expect
    .poll(async () => (await records(page))[0].attachments.length)
    .toBe(3);
  await expect(
    page
      .getByTestId('composer')
      .getByRole('button', { name: 'Add note options' }),
  ).toBeEnabled();
}
async function postButton(page: Page) {
  return page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true });
}

test('explicit Post saves text/two images/file, freezes repeated clicks, retains another draft and inserts backdated saves in timeline order without navigation', async ({
  page,
}) => {
  await start(page, 'Cursor insertion 香港');
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PATCH', 'PUT'].includes(request.method()))
      mutations.push(request.url());
  });
  const text = page.getByRole('textbox', { name: 'Note text' });
  await text.evaluate((node) => {
    (node as HTMLTextAreaElement).setSelectionRange(7, 7);
    node.dispatchEvent(new Event('select', { bubbles: true }));
  });
  await attach(page);
  const draft = (await records(page))[0];
  expect(draft.bodyMarkdown.indexOf('![oriented')).toBe(7);
  await text.press('End');
  await text.press('Enter');
  await text.press('Control+Enter');
  await text.press('Meta+Enter');
  expect(mutations).toEqual([]);
  await page
    .getByTestId('composer')
    .getByText('Attachments (3)', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Move 香港.txt earlier' })
    .first()
    .click();
  await expect
    .poll(async () => (await records(page))[0].attachments[1].filename)
    .toBe('香港.txt');
  await page
    .getByTestId('composer')
    .getByText('Attachments (3)', { exact: true })
    .click();
  const other = {
    ...draft,
    localDraftId: randomUUID(),
    attachments: [],
    bodyMarkdown: 'Another unfinished draft',
    revision: 1,
  };
  await page.evaluate(
    (record) =>
      localStorage.setItem(
        `pandanote:drafts:v1:${record.accountId}:record:${record.localDraftId}`,
        JSON.stringify(record),
      ),
    other,
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let observed!: () => void;
  const seen = new Promise<void>((resolve) => {
    observed = resolve;
  });
  await page.route(
    '**/api/uploads/*/*',
    async (route) => {
      observed();
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  const navigation: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigation.push(frame.url());
  });
  await (
    await postButton(page)
  ).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await seen;
  await expect(text).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Saving…' }).first(),
  ).toBeDisabled();
  expect(await blobCount(page)).toBe(3);
  expect(
    (await records(page)).find((r) => r.localDraftId === draft.localDraftId)
      ?.postingAttempt,
  ).toBeDefined();
  release();
  await expect(page.getByTestId('posted-note')).toHaveCount(initialCards + 1);
  await expect.poll(async () => (await records(page)).length).toBe(1);
  expect((await records(page))[0].localDraftId).toBe(other.localDraftId);
  expect(await blobCount(page)).toBe(0);
  expect(navigation).toEqual([]);
  const card = page.getByTestId('posted-note');
  await expect(card.getByRole('link', { name: '香港.txt' })).toBeVisible();
  const file = await page.request.get(
    (await card.getByRole('link', { name: '香港.txt' }).getAttribute('href')) ??
      '',
    { headers: headers() },
  );
  expect((await file.body()).toString()).toBe('exact file bytes 香港');
  for (const item of draft.attachments.filter((a) => a.kind === 'image')) {
    const output = await page.request.get(
      `/api/attachments/${item.id}/display`,
      { headers: headers() },
    );
    const metadata = await sharp(await output.body()).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.exif).toBeUndefined();
    if (item.filename === 'oriented.txt')
      expect([metadata.width, metadata.height]).toEqual([32, 64]);
  }
  await page.getByRole('textbox', { name: 'Note text' }).fill('Backdated note');
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Add note options' })
    .click();
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Date', exact: true })
    .click();
  // Remain inside the loaded range even when earlier suites seed >30 notes.
  // A save older than the oldest loaded card must not invent a pagination gap.
  const backdate = new Date(Date.now() - 3_600_000).toISOString().slice(0, 16);
  await page.getByLabel('Timeline date/time (UTC)').first().fill(backdate);
  await page
    .getByLabel('Timeline date/time (UTC)')
    .first()
    .dispatchEvent('change');
  await page
    .getByRole('button', { name: 'Close Timeline date', exact: true })
    .click();
  await (await postButton(page)).click();
  await expect(page.getByTestId('posted-note')).toHaveCount(initialCards + 2);
  const backdatedCard = page
    .getByTestId('posted-note')
    .filter({ hasText: 'Backdated note' });
  await expect(backdatedCard).toHaveCount(1);
  expect(await backdatedCard.locator('time').getAttribute('datetime')).toBe(
    `${backdate}:00.000Z`,
  );
  const dates = await page
    .getByTestId('posted-note')
    .locator('time')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('datetime')!),
    );
  expect(dates).toEqual([...dates].sort().reverse());
  await expect(page.getByTestId('posted-note').first()).not.toContainText(
    'Backdated note',
  );
});

test('second upload disconnect retains all local bytes; reload retries only missing uploads with the same mutation and one receipt', async ({
  page,
}) => {
  await start(page, 'Interrupted multi-file save');
  await attach(page);
  let upload = 0;
  const sent: string[] = [];
  await page.route('**/api/uploads/*/*', async (route) => {
    upload++;
    sent.push(route.request().url());
    if (upload === 2) await route.abort('failed');
    else await route.continue();
  });
  await (await postButton(page)).click();
  await expect(page.getByTestId('composer').getByRole('alert')).toContainText(
    'Save interrupted',
  );
  const frozen = (await records(page))[0];
  const mutationId = frozen.postingAttempt!.command.mutationId;
  expect(frozen.postingAttempt!.readyIds).toHaveLength(1);
  expect(await blobCount(page)).toBe(3);
  expect(receiptCount(mutationId)).toBe(0);
  await page.unrouteAll({ behavior: 'wait' });
  await page.reload();
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await expect(page.getByRole('textbox', { name: 'Note text' })).toBeDisabled();
  const retried: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT') retried.push(request.url());
  });
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Retry save', exact: true })
    .click();
  await expect(page.getByTestId('posted-note')).toHaveCount(initialCards + 1);
  expect(retried).toHaveLength(2);
  expect(retried).not.toContain(sent[0]);
  expect(receiptCount(mutationId)).toBe(1);
  await expect.poll(async () => (await records(page)).length).toBe(0);
  expect(await blobCount(page)).toBe(0);
});

test('lost response after real server commit keeps recovery until receipt-first reload retry; no duplicate commit/upload', async ({
  page,
}) => {
  await start(page, 'Lost confirmation');
  await attach(page);
  await page.route(
    '**/api/notes',
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    },
    { times: 1 },
  );
  await (await postButton(page)).click();
  await expect(page.getByTestId('composer').getByRole('alert')).toContainText(
    'confirmation unavailable',
  );
  const frozen = (await records(page))[0];
  expect(receiptCount(frozen.postingAttempt!.command.mutationId)).toBe(1);
  expect(await blobCount(page)).toBe(3);
  await page.reload();
  await page.getByRole('button', { name: 'Write a note…' }).click();
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'PUT' ||
      (request.method() === 'POST' && request.url().endsWith('/api/notes'))
    )
      writes.push(request.url());
  });
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Retry save', exact: true })
    .click();
  await expect(page.getByTestId('posted-note')).toHaveCount(initialCards + 1);
  expect(writes).toEqual([]);
  expect(receiptCount(frozen.postingAttempt!.command.mutationId)).toBe(1);
  await expect.poll(async () => (await records(page)).length).toBe(0);
  expect(await blobCount(page)).toBe(0);
});

test('server-draft recovery posts only on explicit Post, preserves date and published edits use Save changes; stale base retains edits', async ({
  page,
}) => {
  await signIn(page);
  const created = await page.request.post('/api/notes', {
    headers: headers(),
    data: {
      mutationId: randomUUID(),
      action: 'create',
      content: {
        bodyMarkdown: 'Server base',
        timelineAt: 1234,
        location: null,
        attachmentIds: [],
      },
    },
  });
  expect(created.status()).toBe(200);
  const id = (await created.json()).data.noteId as string;
  const moved = await page.request.post(`/api/notes/${id}/actions`, {
    headers: headers(),
    data: {
      mutationId: randomUUID(),
      noteId: id,
      expectedRevision: 1,
      action: 'move-to-draft',
    },
  });
  expect(moved.status()).toBe(200);
  let note = (
    await (
      await page.request.get(`/api/notes/${id}`, { headers: headers() })
    ).json()
  ).data as NoteSnapshot;
  async function seed(
    kind: 'edit-server-draft' | 'edit-published',
    digest = createHash('sha256')
      .update(canonicalNoteSnapshot(note))
      .digest('hex'),
  ) {
    await page.goto('/');
    const accountId = await page.evaluate(
      () =>
        Object.keys(localStorage)
          .find((k) => k.startsWith('pandanote:drafts:v1:'))
          ?.split(':')[3],
    );
    // Empty profile: derive the authenticated singleton account through an actual
    // local draft, rather than a test-only production route.
    let account = accountId;
    if (!account) {
      await page.getByRole('button', { name: 'Write a note…' }).click();
      await page
        .getByRole('textbox', { name: 'Note text' })
        .fill('Temporary seed');
      await expect.poll(async () => (await records(page)).length).toBe(1);
      account = (await records(page))[0].accountId;
    }
    const recovery = {
      schemaVersion: 1,
      accountId: account!,
      localDraftId: randomUUID(),
      revision: 1,
      createdLocallyAt: Date.now(),
      modifiedLocallyAt: Date.now(),
      deleted: false,
      kind,
      serverBase: {
        noteId: id,
        revision: note.revision,
        snapshotDigest: digest,
      },
      bodyMarkdown: 'Local recovery edits',
      timelineAt: note.timelineAt,
      location: note.location,
      attachments: (note.attachments ?? []).map((a) => ({
        id: a.id,
        source: 'server',
        kind: a.kind,
        filename: a.filename,
        mime: a.mime,
        size: a.incomingBytes,
      })),
    };
    await page.evaluate((draft) => {
      for (const key of Object.keys(localStorage))
        if (key.includes(':record:')) localStorage.removeItem(key);
      localStorage.setItem(
        `pandanote:drafts:v1:${draft.accountId}:record:${draft.localDraftId}`,
        JSON.stringify(draft),
      );
    }, recovery);
    await page.goto('/drafts');
    await page
      .getByTestId('local-draft')
      .getByRole('button', { name: /^Resume/ })
      .click();
  }
  await seed('edit-server-draft');
  const writes: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'PUT' ||
      request.method() === 'POST' ||
      request.method() === 'PATCH'
    )
      writes.push(request.url());
  });
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'new.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('device only until Post'),
  });
  await expect
    .poll(async () => (await records(page))[0].attachments.length)
    .toBe(1);
  expect(writes).toEqual([]);
  expect(
    (
      await (
        await page.request.get(`/api/notes/${id}`, { headers: headers() })
      ).json()
    ).data.bodyMarkdown,
  ).toBe('Server base');
  await (await postButton(page)).click();
  await expect.poll(async () => (await records(page)).length).toBe(0);
  note = (
    await (
      await page.request.get(`/api/notes/${id}`, { headers: headers() })
    ).json()
  ).data;
  expect(note).toMatchObject({
    status: 'published',
    timelineAt: 1234,
    bodyMarkdown: 'Local recovery edits',
    revision: 3,
  });
  expect(note.attachmentIds).toHaveLength(1);
  await seed('edit-published');
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect.poll(async () => (await records(page)).length).toBe(0);
  note = (
    await (
      await page.request.get(`/api/notes/${id}`, { headers: headers() })
    ).json()
  ).data;
  expect(note.revision).toBe(4);
  expect(note.timelineAt).toBe(1234);
  await seed('edit-published', '0'.repeat(64));
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(page.getByTestId('composer').getByRole('alert')).toContainText(
    'server base changed',
  );
  expect((await records(page))[0].bodyMarkdown).toBe('Local recovery edits');
  await expect(
    page.getByRole('dialog', { name: 'Note conflict', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Note conflict', exact: true }),
  ).toContainText('Server version · revision 4');
});

test('mobile file-only posting shows transfer/processing feedback and validation retains recoverable files for a separate editable copy', async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Compose a note' }).click();
  const editor = page.getByRole('dialog', { name: 'Write a note' });
  await expect(
    editor.getByRole('button', { name: 'Post', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'only.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('file only'),
  });
  await expect(
    editor.getByRole('button', { name: 'Post', exact: true }),
  ).toBeEnabled();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    '**/api/uploads/*/*',
    async (route) => {
      await held;
      await route.continue();
    },
    { times: 1 },
  );
  await editor.getByRole('button', { name: 'Post', exact: true }).tap();
  await expect(
    editor.getByRole('status').filter({ hasText: /Uploading/ }),
  ).toBeVisible();
  await expect(editor.getByLabel('File upload progress')).toBeVisible();
  release();
  await expect.poll(async () => (await records(page)).length).toBe(0);
  await page.getByRole('button', { name: 'Close Write a note' }).tap();
  await expect(
    page.getByTestId('posted-note').getByRole('link', { name: 'only.txt' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Compose a note' }).tap();
  await editor.getByRole('textbox', { name: 'Note text' }).fill('   ');
  await expect(
    editor.getByRole('button', { name: 'Post', exact: true }),
  ).toBeDisabled();
  const staticImage = await sharp({
    create: { width: 10, height: 5, channels: 3, background: 'green' },
  })
    .png()
    .toBuffer();
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'image-only.png',
    mimeType: 'image/png',
    buffer: staticImage,
  });
  await editor.getByRole('button', { name: 'Post', exact: true }).tap();
  await expect.poll(async () => (await records(page)).length).toBe(0);
  const animated = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAIfkEAAAAAAAsAAAAAAEAAQAAAgJEAQA7',
    'base64',
  );
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'animated.gif',
    mimeType: 'image/gif',
    buffer: animated,
  });
  await editor.getByRole('button', { name: 'Post', exact: true }).tap();
  await expect(editor.getByRole('alert')).toContainText(/animated|animation/i);
  expect(await blobCount(page)).toBe(1);
  const original = (await records(page))[0];
  await editor.getByRole('button', { name: 'Edit a separate copy' }).tap();
  await expect.poll(async () => (await records(page)).length).toBe(2);
  const copies = await records(page);
  expect(copies).toHaveLength(2);
  const copy = copies.find((d) => d.localDraftId !== original.localDraftId)!;
  expect(copy.postingAttempt).toBeUndefined();
  expect(copy.attachments[0].id).not.toBe(original.attachments[0].id);
  await expect(
    editor.getByRole('textbox', { name: 'Note text' }),
  ).toBeEnabled();
});

test('reload during an active upload retains frozen recovery, never auto-posts, and resumes after checking server readiness', async ({
  page,
}) => {
  await start(page, 'Reload while posting');
  await attach(page);
  let count = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let seen!: () => void;
  const seenUpload = new Promise<void>((resolve) => {
    seen = resolve;
  });
  await page.route('**/api/uploads/*/*', async (route) => {
    count++;
    if (count === 2) {
      seen();
      await held;
      await route.abort('failed');
    } else await route.continue();
  });
  await (await postButton(page)).click();
  await seenUpload;
  const frozen = (await records(page))[0];
  expect(frozen.postingAttempt!.readyIds).toHaveLength(1);
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  release();
  // Removing routing while reload's entry module is still being requested can
  // strand that script in Chromium. Let real hydration finish before teardown.
  await expect(
    page.getByRole('button', { name: 'Write a note…' }),
  ).toBeEnabled();
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Write a note…' }).click();
  expect((await records(page))[0].postingAttempt!.command.mutationId).toBe(
    frozen.postingAttempt!.command.mutationId,
  );
  expect(receiptCount(frozen.postingAttempt!.command.mutationId)).toBe(0);
  expect(await blobCount(page)).toBe(3);
  const retried: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT') retried.push(request.url());
  });
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Retry save', exact: true })
    .click();
  await expect(page.getByTestId('posted-note')).toHaveCount(initialCards + 1);
  expect(retried).toHaveLength(2);
  expect(receiptCount(frozen.postingAttempt!.command.mutationId)).toBe(1);
  await expect.poll(async () => (await records(page)).length).toBe(0);
});

test('local confirmation-storage failure after server commit keeps the record and retries the same successful receipt', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        key.includes(':record:') &&
        value.includes('"phase":"confirmed"') &&
        !sessionStorage.getItem('confirmation-quota-once')
      ) {
        sessionStorage.setItem('confirmation-quota-once', '1');
        throw new DOMException('synthetic quota', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await start(page, 'Confirmed but local storage failed');
  await (await postButton(page)).click();
  await expect(
    page.getByTestId('composer').getByRole('alert').first(),
  ).toContainText(/storage failed/);
  const frozen = (await records(page))[0];
  expect(frozen.postingAttempt!.phase).toBe('committing');
  expect(receiptCount(frozen.postingAttempt!.command.mutationId)).toBe(1);
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/notes'))
      writes.push(request.url());
  });
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Retry save', exact: true })
    .click();
  await expect(page.getByTestId('posted-note')).toHaveCount(initialCards + 1);
  expect(writes).toEqual([]);
  await expect.poll(async () => (await records(page)).length).toBe(0);
});

test('retired-tag preflight and expired-session errors retain work before freezing or uploading', async ({
  page,
}) => {
  await start(page, '#RetiredS08 kept work');
  const data = readdirSync('.e2e-data').find((entry) =>
    entry.startsWith('run-'),
  )!;
  const db = new Database(join('.e2e-data', data, 'db/pandanote.sqlite'));
  try {
    db.prepare(
      "INSERT INTO tag_changes(old_key, action, target_key, created_at) VALUES (?, 'remove', NULL, ?)",
    ).run('retireds08', Date.now());
  } finally {
    db.close();
  }
  await (await postButton(page)).click();
  await expect(
    page.getByRole('dialog', { name: 'Review retired tags' }),
  ).toBeVisible();
  const frozen = (await records(page))[0];
  expect(frozen.bodyMarkdown).toBe('#RetiredS08 kept work');
  expect(frozen.postingAttempt).toBeUndefined();
  await page.getByRole('button', { name: 'Close Review retired tags' }).click();
  await page.goto('/drafts');
  await page
    .getByRole('button', { name: 'Create another draft', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Note text' })).toBeEnabled();
  await page
    .getByRole('textbox', { name: 'Note text' })
    .fill('Explicitly resolved local copy');
  await page.context().clearCookies();
  await (await postButton(page)).click();
  await expect(
    page.getByTestId('composer').getByRole('link', { name: /Sign in again/ }),
  ).toBeVisible();
  expect(await records(page)).toHaveLength(2);
  await page.context().addCookies(cookies);
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(
    page.getByTestId('composer').getByText('Saved on server.', { exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await records(page)).length).toBe(1);
  expect((await records(page))[0].localDraftId).toBe(frozen.localDraftId);
});
