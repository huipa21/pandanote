import { createHash, randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { browserSession } from '../helpers/browser-session.ts';
import { canonicalNoteMutation } from '../../src/lib/shared/notes.ts';
import type { NoteSnapshot } from '../../src/lib/shared/domain.ts';
import type { LocalDraft } from '../../src/lib/client/drafts/model.ts';
const origin = 'http://127.0.0.1:4173';
async function savedOnServer(page: Page) {
  await expect(
    page.getByTestId('composer').getByText('Saved on server.', { exact: true }),
  ).toBeVisible();
}
async function auth(page: Page) {
  const cookies = await browserSession(page);
  return {
    origin,
    cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
  };
}
async function get(page: Page, id: string): Promise<NoteSnapshot> {
  const response = await page.request.get(`/api/notes/${id}`, {
    headers: await auth(page),
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}
async function create(
  page: Page,
  body: string,
  media = false,
  timelineAt?: number,
): Promise<NoteSnapshot> {
  const headers = await auth(page);
  const items = media
    ? await Promise.all(
        [0, 1].map(async (n) => ({
          id: randomUUID(),
          filename: `synthetic-${n}.png`,
          bytes: await sharp({
            create: {
              width: 1200,
              height: 600,
              channels: 3,
              background: n ? 'blue' : 'green',
            },
          })
            .png()
            .toBuffer(),
        })),
      )
    : [];
  const command = {
    mutationId: randomUUID(),
    action: 'create' as const,
    content: {
      bodyMarkdown:
        body +
        items
          .map((item) => `\n\n![${item.filename}](attachment:${item.id})`)
          .join(''),
      timelineAt: timelineAt ?? Date.now() - 60_000,
      location: null,
      attachmentIds: items.map((item) => item.id),
    },
  };
  if (items.length) {
    const init = await page.request.post('/api/uploads', {
      headers,
      data: {
        mutationId: command.mutationId,
        requestDigest: createHash('sha256')
          .update(canonicalNoteMutation(command))
          .digest('hex'),
        items: items.map((item) => ({
          id: item.id,
          filename: item.filename,
          incomingBytes: item.bytes.length,
          incomingDigest: createHash('sha256').update(item.bytes).digest('hex'),
        })),
      },
    });
    expect(init.status()).toBe(200);
    const batch = (await init.json()).data.batch.id;
    for (const item of items)
      expect(
        (
          await page.request.put(`/api/uploads/${batch}/${item.id}`, {
            headers: { ...headers, 'content-type': 'application/octet-stream' },
            data: item.bytes,
          })
        ).status(),
      ).toBe(200);
  }
  const response = await page.request.post('/api/notes', {
    headers,
    data: command,
  });
  expect(response.status()).toBe(200);
  return get(page, (await response.json()).data.noteId);
}
async function update(page: Page, note: NoteSnapshot, body: string) {
  const response = await page.request.patch(`/api/notes/${note.id}`, {
    headers: await auth(page),
    data: {
      mutationId: randomUUID(),
      action: 'update',
      noteId: note.id,
      expectedRevision: note.revision,
      content: {
        bodyMarkdown: body,
        timelineAt: note.timelineAt,
        location: note.location,
        attachmentIds: note.attachmentIds,
      },
    },
  });
  expect(response.status()).toBe(200);
  return get(page, note.id);
}
async function records(page: Page): Promise<LocalDraft[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.includes(':record:'))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .filter((d) => !d.deleted),
  );
}
async function localBytes(page: Page, draft: LocalDraft) {
  const item = draft.attachments.find((file) => file.source === 'local')!;
  return page.evaluate(
    async ({ accountId, draftId, id }) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const req = indexedDB.open('pandanote-draft-blobs', 1);
        req.onsuccess = () => resolve(req.result);
      });
      const row = await new Promise<{ blob: Blob }>((resolve) => {
        const tx = db.transaction('blobs');
        const req = tx.objectStore('blobs').get([accountId, draftId, id]);
        tx.oncomplete = () => resolve(req.result);
      });
      db.close();
      return row.blob.text();
    },
    { accountId: draft.accountId, draftId: draft.localDraftId, id: item.id },
  );
}
async function edit(page: Page, id: string, text: string) {
  await page.goto(`/notes/${id}`);
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Note detail', exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Note text', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill(text);
  await expect(page.getByTestId('composer').getByRole('status')).toHaveText(
    'Saved on this device.',
  );
}
async function addLocal(page: Page) {
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'losing.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('retained losing bytes 香港'),
  });
  await expect
    .poll(async () =>
      (await records(page)).some((d) =>
        d.attachments.some((a) => a.filename === 'losing.txt'),
      ),
    )
    .toBe(true);
}
const detail = (page: Page) =>
  page.getByRole('dialog', { name: 'Note detail', exact: true });
const conflict = (page: Page) =>
  page.getByRole('dialog', { name: 'Note conflict', exact: true });

test('private full detail supports shallow history/filters/scroll/focus, direct refresh/no-JS and safe missing links', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const headers = await auth(page);
  const tag = `s12history${randomUUID().slice(0, 8)}`;
  for (let n = 0; n < 34; n++)
    await create(
      page,
      `History ${n} #${tag}\n\n` +
        'full long source 香港\n\n'.repeat(500) +
        'DETAIL END',
      false,
      Date.UTC(2020, 0, 1) + n * 60_000,
    );
  await page.goto(`/?tag=${tag}`);
  // 24 large 8 KiB previews fill the existing 192 KiB page budget.
  await expect(page.getByTestId('posted-note')).toHaveCount(24);
  const opener = page
    .getByTestId('posted-note')
    .nth(6)
    .getByRole('link', { name: 'Open note', exact: true });
  await opener.scrollIntoViewIfNeeded();
  const scroll = await page
    .locator('#notes-pane')
    .evaluate((node) => node.scrollTop);
  const href = (await opener.getAttribute('href'))!;
  await opener.click();
  await expect(page).toHaveURL(href);
  await expect(detail(page)).toBeVisible();
  await expect(detail(page)).toContainText('DETAIL END');
  await page.screenshot({ path: test.info().outputPath('detail-desktop.png') });
  await page.keyboard.press('Shift+Tab');
  expect(
    await page.evaluate(() =>
      document.activeElement
        ?.closest('dialog')
        ?.getAttribute('aria-labelledby'),
    ),
  ).toBeTruthy();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(`/?tag=${tag}`);
  await expect(opener).toBeFocused();
  expect(
    await page.locator('#notes-pane').evaluate((node) => node.scrollTop),
  ).toBeCloseTo(scroll, 0);
  await opener.click();
  await page.goBack();
  await expect(page).toHaveURL(`/?tag=${tag}`);
  await page.goForward();
  await expect(detail(page)).toBeVisible();
  await page.reload();
  await expect(detail(page)).toBeVisible();
  await expect(page.locator('dialog.detail')).toHaveCount(1);
  await expect(detail(page)).toContainText('DETAIL END');
  await page
    .getByRole('button', { name: 'Close Note detail', exact: true })
    .click();
  await expect(page).toHaveURL('/');
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies(await page.context().cookies());
  const ssr = await context.newPage();
  await ssr.goto(href);
  await expect(detail(ssr)).toBeVisible();
  await expect(detail(ssr)).toContainText('DETAIL END');
  await context.close();
  expect(
    (await page.request.get(`/notes/${randomUUID()}`, { headers })).status(),
  ).toBe(404);
  const privateRequest = await page.request.get(href, {
    headers: { cookie: '' },
    maxRedirects: 0,
  });
  expect(privateRequest.status()).toBe(303);
});

test('published edits recover after reload without upload/autosave; Save changes and server draft Post retain dates', async ({
  page,
}) => {
  const note = await create(page, 'Original #s12edit');
  const writes: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PATCH', 'PUT'].includes(request.method()))
      writes.push(request.url());
  });
  await edit(page, note.id, 'Local recovery changes #s12edit');
  await addLocal(page);
  expect(writes).toEqual([]);
  await page.reload();
  await page.goto(`/notes/${note.id}`);
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    'Local recovery changes #s12edit',
  );
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await savedOnServer(page);
  const saved = await get(page, note.id);
  expect(saved.timelineAt).toBe(note.timelineAt);
  expect(saved.createdAt).toBe(note.createdAt);
  expect(saved.contentEditedAt).not.toBeNull();
  expect(saved.attachments?.[0].filename).toBe('losing.txt');
  const move = await page.request.post(`/api/notes/${note.id}/actions`, {
    headers: await auth(page),
    data: {
      action: 'move-to-draft',
      mutationId: randomUUID(),
      noteId: note.id,
      expectedRevision: saved.revision,
    },
  });
  expect(move.status()).toBe(200);
  await page.goto(`/notes/${note.id}`);
  await page.getByRole('button', { name: 'Edit server draft' }).click();
  await page
    .getByRole('textbox', { name: 'Note text' })
    .fill('Republished from detail #s12edit');
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await savedOnServer(page);
  expect((await get(page, note.id)).timelineAt).toBe(note.timelineAt);
});

test('two contexts preserve losing files and publish a conflict copy with shared server images; loading server keeps original recovery', async ({
  page,
  browser,
}) => {
  const note = await create(page, 'Original with server images', true);
  const context = await browser.newContext();
  await context.addCookies(await page.context().cookies());
  const second = await context.newPage();
  await edit(page, note.id, 'Winner');
  await edit(second, note.id, 'Losing copy text 香港');
  await addLocal(second);
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await savedOnServer(page);
  await second
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(conflict(second)).toBeVisible();
  await expect(conflict(second)).toContainText('Winner');
  await second.screenshot({
    path: test.info().outputPath('conflict-desktop.png'),
  });
  await conflict(second)
    .getByRole('button', { name: 'Save local as separate note' })
    .click();
  await second
    .getByRole('button', { name: 'Confirm separate note', exact: true })
    .click();
  await savedOnServer(second);
  expect((await get(page, note.id)).bodyMarkdown).toBe('Winner');
  const response = await second.request.get('/api/notes?q="Losing copy text"', {
    headers: await auth(second),
  });
  const copies = (await response.json()).data.items;
  expect(copies).toHaveLength(1);
  expect(copies[0].id).not.toBe(note.id);
  expect(copies[0].attachmentIds).toEqual(
    expect.arrayContaining(note.attachmentIds),
  );
  const originalRecovery = (await records(second))[0];
  expect(originalRecovery.bodyMarkdown).toBe('Losing copy text 香港');
  expect(await localBytes(second, originalRecovery)).toBe(
    'retained losing bytes 香港',
  );
  const publishedCopy = await get(second, copies[0].id);
  const file = publishedCopy.attachments!.find((item) => item.kind === 'file')!;
  const downloaded = await second.request.get(
    `/api/attachments/${file.id}/file`,
    { headers: await auth(second) },
  );
  expect((await downloaded.body()).toString()).toBe(
    'retained losing bytes 香港',
  );
  expect(
    originalRecovery.attachments.some((a) => a.filename === 'losing.txt'),
  ).toBe(true);
  await second.goto(`/notes/${note.id}`);
  await second.getByRole('button', { name: 'Edit note', exact: true }).click();
  await expect(conflict(second)).toBeVisible();
  await conflict(second)
    .getByRole('button', { name: 'Load server version', exact: true })
    .click();
  await second
    .getByRole('button', { name: 'Confirm load server', exact: true })
    .click();
  await expect(second.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    'Winner',
  );
  expect(
    (await records(second)).find(
      (d) => d.localDraftId === originalRecovery.localDraftId,
    )?.bodyMarkdown,
  ).toBe('Losing copy text 香港');
  await context.close();
});

test('explicit replace races a third edit and conflicts again, then replaces only the newly observed revision with losing files intact', async ({
  page,
  browser,
}) => {
  const note = await create(page, 'Original replace');
  const context = await browser.newContext();
  await context.addCookies(await page.context().cookies());
  const second = await context.newPage();
  await edit(page, note.id, 'Winner revision 2');
  await edit(second, note.id, 'Local replacement');
  await addLocal(second);
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await savedOnServer(page);
  await second
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(conflict(second)).toBeVisible();
  await conflict(second)
    .getByRole('button', { name: 'Explicitly replace revision 2' })
    .click();
  const third = await update(
    page,
    await get(page, note.id),
    'Third racing edit',
  );
  expect(third.revision).toBe(3);
  await second
    .getByRole('button', { name: 'Confirm replace', exact: true })
    .click();
  await expect(conflict(second)).toBeVisible();
  await expect(conflict(second)).toContainText('Third racing edit');
  expect((await get(page, note.id)).bodyMarkdown).toBe('Third racing edit');
  expect(
    (await records(second)).filter(
      (d) => d.bodyMarkdown === 'Local replacement',
    ).length,
  ).toBeGreaterThanOrEqual(2);
  await conflict(second)
    .getByRole('button', { name: 'Explicitly replace revision 3' })
    .click();
  await second
    .getByRole('button', { name: 'Confirm replace', exact: true })
    .click();
  await savedOnServer(second);
  const replaced = await get(page, note.id);
  expect(replaced.revision).toBe(4);
  expect(replaced.bodyMarkdown).toBe('Local replacement');
  expect(replaced.attachments?.[0].filename).toBe('losing.txt');
  for (const recovery of (await records(second)).filter(
    (d) => d.bodyMarkdown === 'Local replacement',
  )) {
    expect(await localBytes(second, recovery)).toBe(
      'retained losing bytes 香港',
    );
  }
  await context.close();
});

test('detail GET errors retry safely and a late closed request cannot reopen or replace another detail', async ({
  page,
}) => {
  const note = await create(page, 'Retry private detail #s12retry');
  await page.goto('/?tag=s12retry');
  const opener = page
    .locator(`[data-note-id="${note.id}"]`)
    .getByRole('link', { name: 'Open note', exact: true });
  await page.route(
    `**/api/notes/${note.id}`,
    (route) => route.abort('failed'),
    { times: 1 },
  );
  await opener.click();
  await expect(detail(page).getByRole('alert')).toContainText(
    'could not be loaded',
  );
  await detail(page).getByRole('button', { name: 'Retry note' }).click();
  await expect(detail(page)).toContainText('Retry private detail');
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route(
    `**/api/notes/${note.id}`,
    async (route) => {
      entered();
      await held;
      await route.continue().catch(() => {});
    },
    { times: 1 },
  );
  await opener.click();
  await seen;
  await page.goBack();
  await expect(detail(page)).not.toBeVisible();
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page).toHaveURL('/?tag=s12retry');
  await expect(detail(page)).not.toBeVisible();
});

test('Trash status conflicts offer read-only server detail while keeping local recovery and files', async ({
  page,
}) => {
  const note = await create(page, 'Status race original');
  await edit(page, note.id, 'Retained after Trash race');
  await addLocal(page);
  const response = await page.request.post(`/api/notes/${note.id}/actions`, {
    headers: await auth(page),
    data: {
      mutationId: randomUUID(),
      action: 'trash',
      noteId: note.id,
      expectedRevision: note.revision,
    },
  });
  expect(response.status()).toBe(200);
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(conflict(page)).toBeVisible();
  await expect(
    conflict(page).getByRole('button', {
      name: 'Explicitly replace revision 2',
    }),
  ).toBeDisabled();
  await conflict(page)
    .getByRole('button', { name: 'Load server version', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm load server', exact: true })
    .click();
  await expect(detail(page)).toBeVisible();
  await expect(detail(page)).toContainText('trash (was published)');
  await expect(
    detail(page).getByRole('button', { name: 'Edit note', exact: true }),
  ).toBeDisabled();
  const recovery = (await records(page))[0];
  expect(recovery.bodyMarkdown).toBe('Retained after Trash race');
  expect(await localBytes(page, recovery)).toBe('retained losing bytes 香港');
});

test('mobile published edit opens a focused full-screen editor, retains files on safe Escape and saves only on explicit Save changes', async ({
  page,
}) => {
  const note = await create(page, 'Mobile published source');
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: string[] = [];
  page.on('request', (request) => {
    if (['POST', 'PATCH', 'PUT'].includes(request.method()))
      writes.push(request.url());
  });
  await page.goto(`/notes/${note.id}`);
  await detail(page)
    .getByRole('button', { name: 'Edit note', exact: true })
    .click();
  const editor = page.getByRole('dialog', {
    name: 'Write a note',
    exact: true,
  });
  await expect(editor).toBeVisible();
  const text = editor.getByRole('textbox', { name: 'Note text', exact: true });
  await expect(text).toBeFocused();
  await text.fill('Mobile local recovery');
  await addLocal(page);
  await expect(
    editor.getByText('Saved on this device.', { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
  await page.setViewportSize({ width: 390, height: 400 });
  const save = editor.getByRole('button', {
    name: 'Save changes',
    exact: true,
  });
  const box = await save.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(400);
  await page.screenshot({
    path: test.info().outputPath('edit-mobile-short.png'),
  });
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();
  const recovery = (await records(page))[0];
  expect(await localBytes(page, recovery)).toBe('retained losing bytes 香港');
  expect((await get(page, note.id)).bodyMarkdown).toBe(
    'Mobile published source',
  );
  await page
    .getByRole('button', { name: 'Continue writing', exact: true })
    .click();
  await expect(text).toHaveValue('Mobile local recovery');
  await save.click();
  await expect(
    editor.getByText('Saved on server.', { exact: true }),
  ).toBeVisible();
  expect((await get(page, note.id)).bodyMarkdown).toBe('Mobile local recovery');
});

test('image viewer loads only selected display WebP, supports keyboard zoom/pan/navigation/download, nested Escape and mobile swipe', async ({
  page,
}) => {
  const note = await create(page, 'Viewer image note #s12viewer', true);
  const displayRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/attachments\/[^/]+\/display/.test(request.url()))
      displayRequests.push(request.url());
  });
  await page.goto('/?tag=s12viewer');
  const viewer = page.getByRole('dialog', {
    name: 'Image viewer',
    exact: true,
  });
  await page
    .getByTestId('posted-note')
    .getByRole('button', { name: 'Open image: synthetic-0.png', exact: true })
    .click();
  await expect(page).toHaveURL(`/notes/${note.id}`);
  await expect(viewer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer).not.toBeVisible();
  await expect(detail(page)).toBeVisible();
  const opener = detail(page).getByRole('button', {
    name: 'Open image: synthetic-0.png',
    exact: true,
  });
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('img')).toHaveAttribute(
    'src',
    `/api/attachments/${note.attachmentIds[0]}/display`,
  );
  await expect(viewer).toContainText('Image 1 of 2');
  expect(
    displayRequests.every((url) => url.includes(note.attachmentIds[0])),
  ).toBe(true);
  await page.keyboard.press('+');
  await expect(viewer).toContainText('150%');
  const area = await viewer.locator('.viewport').boundingBox();
  await page.mouse.move(area!.x + area!.width / 2, area!.y + area!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    area!.x + area!.width / 2 + 80,
    area!.y + area!.height / 2 + 40,
  );
  await page.mouse.up();
  await expect(viewer.locator('img')).not.toHaveAttribute(
    'style',
    /translate\(0px, 0px\)/,
  );
  await page.keyboard.press('ArrowRight');
  await expect(viewer).toContainText('Image 2 of 2');
  await page.screenshot({ path: test.info().outputPath('viewer-desktop.png') });
  const download = page.waitForEvent('download');
  await viewer.getByRole('link', { name: 'Download WebP' }).click();
  const output = await download;
  expect(output.suggestedFilename()).toMatch(/\.webp$/);
  expect((await sharp((await output.path())!).metadata()).format).toBe('webp');
  await page.keyboard.press('Escape');
  await expect(viewer).not.toBeVisible();
  await expect(detail(page)).toBeVisible();
  await expect(opener).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  const box = await detail(page).boundingBox();
  expect(box?.width).toBe(390);
  expect(box?.height).toBe(844);
  await opener.click();
  await expect(viewer).toBeVisible();
  const bounds = await viewer.locator('.viewport').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = bounds!.x + bounds!.width * 0.8,
    y = bounds!.y + bounds!.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: x - 120, y }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(viewer).toContainText('Image 2 of 2');
  await expect(viewer.locator('img')).toHaveJSProperty('complete', true);
  await page.screenshot({ path: test.info().outputPath('viewer-mobile.png') });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
