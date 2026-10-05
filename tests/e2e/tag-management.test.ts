import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';
import type { NoteSnapshot } from '../../src/lib/shared/domain.ts';
import type { LocalDraft } from '../../src/lib/client/drafts/model.ts';
import type { TagAction } from '../../src/lib/shared/tags.ts';
const origin = 'http://127.0.0.1:4173';
test.use({ hasTouch: true });
async function headers(page: Page) {
  const cookies = await browserSession(page);
  return {
    origin,
    cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
  };
}
async function get(page: Page, id: string): Promise<NoteSnapshot> {
  const response = await page.request.get(`/api/notes/${id}`, {
    headers: await headers(page),
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}
async function create(page: Page, body: string) {
  const response = await page.request.post('/api/notes', {
    headers: await headers(page),
    data: {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: body,
        timelineAt: 1000,
        location: null,
        attachmentIds: [],
      },
    },
  });
  expect(response.status()).toBe(200);
  return get(page, (await response.json()).data.noteId);
}
async function manage(page: Page, operation: TagAction) {
  const h = await headers(page);
  const preview = await page.request.post('/api/tags/preview', {
    headers: h,
    data: operation,
  });
  expect(preview.status()).toBe(200);
  const command = {
    operation,
    mutationId: randomUUID(),
    previewToken: (await preview.json()).data.previewToken,
    confirmed: true,
  };
  const result = await page.request.post('/api/tags', {
    headers: h,
    data: command,
  });
  expect(result.status()).toBe(200);
  return (await result.json()).data;
}
async function records(page: Page): Promise<LocalDraft[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.includes(':record:'))
      .map((k) => JSON.parse(localStorage.getItem(k)!))
      .filter((d) => !d.deleted),
  );
}
async function start(page: Page, body: string) {
  await browserSession(page);
  await page.goto('/drafts');
  await page
    .getByRole('button', { name: 'Create another draft', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill(body);
  await expect(page.getByTestId('composer').getByRole('status')).toHaveText(
    'Saved on this device.',
  );
}
test('private tag endpoints reject cross-origin requests; Back cannot restore retired filtered cards after management', async ({
  page,
  browser,
}) => {
  const key = `s14back${randomUUID().slice(0, 8)}`;
  const note = await create(page, `only #${key}`);
  const anonymous = await browser.newContext();
  try {
    const response = await anonymous.request.get(origin + '/api/tags');
    expect(response.status()).toBe(401);
  } finally {
    await anonymous.close();
  }
  const rejected = await page.request.post('/api/tags/preview', {
    headers: { ...(await headers(page)), origin: 'https://attacker.invalid' },
    data: { source: key, action: 'remove', target: null },
  });
  expect(rejected.status()).toBe(403);
  const oversized = await page.request.post('/api/tags/preview', {
    headers: { ...(await headers(page)), 'content-type': 'application/json' },
    data: JSON.stringify({ text: 'x'.repeat(5000) }),
  });
  expect(oversized.status()).toBe(400);
  await page.goto(`/?tag=${key}`);
  await expect(page.locator(`[data-note-id="${note.id}"]`)).toBeVisible();
  await page.getByRole('link', { name: 'Manage', exact: true }).click();
  await page.getByRole('button', { name: `#${key}`, exact: true }).click();
  await page.getByLabel('Tag action', { exact: true }).selectOption('remove');
  await page
    .getByRole('button', { name: 'Preview tag changes', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm remove', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Updated 1 server notes',
  );
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`tag=${key}`));
  await expect(page.locator(`[data-note-id="${note.id}"]`)).toHaveCount(0);
});
const post = (page: Page) =>
  page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true });

test('management previews counts and exact source across statuses, case rename/merge/remove; mobile source review and explicit confirmations', async ({
  page,
}, info) => {
  const key = `s14${randomUUID().slice(0, 8)}`,
    target = `香港${randomUUID().slice(0, 8)}`;
  const body = `Text #${key} #${key.toUpperCase()} \n\n\`#${key}\` \\#${key} [#${key}](https://x.invalid/#${key})`;
  const a = await create(page, body),
    b = await create(page, body),
    c = await create(page, body);
  for (const [note, action] of [
    [b, 'move-to-draft'],
    [c, 'trash'],
  ] as const)
    expect(
      (
        await page.request.post(`/api/notes/${note.id}/actions`, {
          headers: await headers(page),
          data: {
            action,
            noteId: note.id,
            expectedRevision: 1,
            mutationId: randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
  await page.goto(`/tags?q=${key}`);
  await expect(
    page.getByText('1 published · 1 server drafts · 1 Trash', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: `#${key}`, exact: true }).click();
  await page.getByLabel('Target tag spelling').fill(key.toUpperCase());
  await page
    .getByRole('button', { name: 'Preview tag changes', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Confirm tag changes' });
  await expect(dialog).toContainText(
    '1 published · 1 server drafts · 1 Trash notes',
  );
  await expect(
    dialog.getByRole('link', { name: 'Inspect full note' }),
  ).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('tag-preview-desktop.png') });
  await dialog
    .getByRole('button', { name: 'Confirm rename', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect((await get(page, a.id)).bodyMarkdown).toBe(
    body
      .replaceAll(`#${key}`, `#${key.toUpperCase()}`)
      .replaceAll(`\`#${key.toUpperCase()}\``, `\`#${key}\``)
      .replaceAll(`\\#${key.toUpperCase()}`, `\\#${key}`)
      .replaceAll(
        `https://x.invalid/#${key.toUpperCase()}`,
        `https://x.invalid/#${key}`,
      ),
  );
  await create(page, `target #${target}`);
  await page.reload();
  await page
    .getByRole('button', { name: `#${key.toUpperCase()}`, exact: true })
    .click();
  await page.getByLabel('Target tag spelling').fill(target);
  await page
    .getByRole('button', { name: 'Preview tag changes', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Choose Merge');
  await page.getByLabel('Tag action', { exact: true }).selectOption('merge');
  await page
    .getByRole('button', { name: 'Preview tag changes', exact: true })
    .click();
  await dialog
    .getByRole('button', { name: 'Confirm merge', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  for (const note of [a, b, c])
    expect((await get(page, note.id)).tags).toEqual([target]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/tags?q=${target}`);
  await page.getByRole('button', { name: `#${target}`, exact: true }).tap();
  await page.getByLabel('Tag action', { exact: true }).selectOption('remove');
  await page
    .getByRole('button', { name: 'Preview tag changes', exact: true })
    .tap();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: info.outputPath('tag-remove-mobile.png') });
  await dialog
    .getByRole('button', { name: 'Confirm remove', exact: true })
    .tap();
  await expect(dialog).not.toBeVisible();
  expect((await get(page, a.id)).tags).toEqual([]);
  expect((await get(page, b.id)).status).toBe('draft');
  expect((await get(page, c.id)).status).toBe('trash');
});

test('lost management response survives reload and retries original receipt exactly once', async ({
  page,
}) => {
  const key = `s14retry${randomUUID().slice(0, 8)}`;
  const a = await create(page, `#${key}`);
  await page.goto(`/tags?q=${key}`);
  await page.getByRole('button', { name: `#${key}`, exact: true }).click();
  await page.getByLabel('Tag action', { exact: true }).selectOption('remove');
  await page
    .getByRole('button', { name: 'Preview tag changes', exact: true })
    .click();
  let payload = '';
  await page.route(
    '**/api/tags',
    async (route) => {
      payload = route.request().postData()!;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    },
    { times: 1 },
  );
  await page
    .getByRole('button', { name: 'Confirm remove', exact: true })
    .click();
  await expect.poll(async () => (await get(page, a.id)).revision).toBe(2);
  await expect(
    page.getByRole('button', { name: 'Check and retry tag operation' }),
  ).toBeVisible();
  await page.reload();
  const retried = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/api/tags'),
  );
  await page
    .getByRole('button', { name: 'Check and retry tag operation' })
    .click();
  expect((await retried).postData()).toBe(payload);
  await expect(page.getByRole('status')).toContainText(
    'Updated 1 server notes',
  );
  expect((await get(page, a.id)).revision).toBe(2);
});

test('local tags are never silently rewritten; preflight follows chains before uploads, explicit history choice preserves files and requires another Post', async ({
  page,
}) => {
  const key = `s14local${randomUUID().slice(0, 8)}`,
    target = `図書館${randomUUID().slice(0, 8)}`;
  await create(page, `#${key}`);
  await start(page, `local #${key} \`#${key}\``);
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'local.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('local bytes 香港'),
  });
  await expect
    .poll(async () => (await records(page))[0]?.attachments.length)
    .toBe(1);
  const original = (await records(page))[0];
  await manage(page, { source: key, action: 'rename', target: 'next' + key });
  await manage(page, { source: 'next' + key, action: 'rename', target });
  expect((await records(page))[0].bodyMarkdown).toBe(original.bodyMarkdown);
  let uploads = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/uploads') && r.method() !== 'GET') uploads++;
  });
  await post(page).click();
  const stale = page.getByRole('dialog', { name: 'Review retired tags' });
  await expect(stale).toContainText(`#${target}`);
  expect(uploads).toBe(0);
  expect((await records(page))[0].postingAttempt).toBeUndefined();
  await stale
    .getByRole('button', { name: 'Apply rename/removal history locally' })
    .click();
  await expect(stale).not.toBeVisible();
  expect((await records(page))[0].bodyMarkdown).toBe(
    `local #${target} \`#${key}\``,
  );
  expect((await records(page))[0].attachments).toEqual(original.attachments);
  expect(uploads).toBe(0);
  await post(page).click();
  await expect.poll(async () => (await records(page)).length).toBe(0);
  expect(uploads).toBeGreaterThan(0);
});

test('removed-tag recreation is explicit and generation-bound, no automatic publication', async ({
  page,
}) => {
  const key = `s14recreate${randomUUID().slice(0, 8)}`;
  await create(page, `#${key}`);
  await start(page, `recreated #${key}`);
  await manage(page, { source: key, action: 'remove', target: null });
  await post(page).click();
  const dialog = page.getByRole('dialog', { name: 'Review retired tags' });
  await expect(dialog).toContainText('removed');
  page.once('dialog', (d) => d.accept());
  await dialog
    .getByRole('button', {
      name: 'Intentionally keep or recreate retired tags',
    })
    .click();
  await expect(dialog).not.toBeVisible();
  const draft = (await records(page))[0];
  expect(draft.bodyMarkdown).toBe(`recreated #${key}`);
  expect(draft.tagAcknowledgements?.[0].key).toBe(key);
  expect(draft.postingAttempt).toBeUndefined();
  await page.reload();
  await page
    .getByTestId('local-draft')
    .getByRole('button', { name: /^Resume/ })
    .click();
  await post(page).click();
  await expect.poll(async () => (await records(page)).length).toBe(0);
  const check = await page.request.post('/api/tags/check', {
    headers: await headers(page),
    data: { keys: [key] },
  });
  expect((await check.json()).data).toHaveLength(1);
});

test('frozen stale save forks safely with remapped blobs; original retry remains unchanged', async ({
  page,
}) => {
  const key = `s14frozen${randomUUID().slice(0, 8)}`;
  await create(page, `#${key}`);
  await start(page, `frozen #${key}`);
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'frozen.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('frozen bytes'),
  });
  await expect
    .poll(async () => (await records(page))[0]?.attachments.length)
    .toBe(1);
  await page.route(
    '**/api/notes',
    async (route) => {
      if (route.request().method() === 'POST') await route.abort('failed');
      else await route.continue();
    },
    { times: 1 },
  );
  await post(page).click();
  await expect(page.getByTestId('composer').getByRole('alert')).toContainText(
    /interrupted/,
  );
  const original = (await records(page))[0];
  expect(original.postingAttempt).toBeDefined();
  await manage(page, { source: key, action: 'remove', target: null });
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Retry save', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Review retired tags' });
  await expect(dialog).toContainText('frozen');
  await dialog
    .getByRole('button', { name: 'Remove these hashtags locally' })
    .click();
  await expect(dialog).not.toBeVisible();
  const drafts = await records(page);
  expect(drafts).toHaveLength(2);
  expect(
    drafts.find((d) => d.localDraftId === original.localDraftId)
      ?.postingAttempt,
  ).toEqual(original.postingAttempt);
  const copy = drafts.find((d) => d.localDraftId !== original.localDraftId)!;
  expect(copy.postingAttempt).toBeUndefined();
  expect(copy.attachments[0].id).not.toBe(original.attachments[0].id);
  expect(copy.bodyMarkdown).toBe('frozen ');
  await post(page).click();
  await expect.poll(async () => (await records(page)).length).toBe(1);
});

test('autocomplete is keyboard/touch accessible and excluded from code; tag management invalidates a concurrent server editor', async ({
  page,
}) => {
  const key = `s14complete${randomUUID().slice(0, 8)}`;
  const a = await create(page, `#${key}`);
  await start(page, '#s14complete');
  const editor = page.getByRole('textbox', { name: 'Note text', exact: true });
  await editor.press('End');
  await expect(
    page.getByRole('listbox', { name: 'Existing tags' }),
  ).toBeVisible();
  await editor.press('ArrowDown');
  await editor.press('Enter');
  await expect(editor).toHaveValue(`#${key}`);
  await editor.fill('#s14complete');
  await editor.press('End');
  await page.getByRole('option', { name: `#${key}`, exact: true }).tap();
  await expect(editor).toHaveValue(`#${key}`);
  await editor.fill('`#s14complete`');
  await editor.press('End');
  await expect(
    page.getByRole('listbox', { name: 'Existing tags' }),
  ).toHaveCount(0);
  await page.goto(`/notes/${a.id}`);
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await editor.fill('losing local text, tag deliberately removed');
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'losing.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('losing bytes'),
  });
  await manage(page, {
    source: key,
    action: 'rename',
    target: 'changed' + key,
  });
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Note conflict' }),
  ).toBeVisible();
  expect(
    (await records(page)).some(
      (d) =>
        d.bodyMarkdown === 'losing local text, tag deliberately removed' &&
        d.attachments.length === 1,
    ),
  ).toBe(true);
});
