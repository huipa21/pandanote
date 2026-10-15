import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import {
  authenticatedHeaders,
  browserSession,
} from '../helpers/browser-session.ts';
import { clipRows, fakeMicrophone, recordClip } from '../helpers/voice.ts';

/* VN06 (VN-POST): save, retry, edit, discard and the Trash lifecycle of voice clips,
 * through the real editor against the real server. */
test.use(fakeMicrophone);

interface ApiNote {
  id: string;
  revision: number;
  attachmentIds: string[];
}
async function getNote(page: Page, id: string): Promise<ApiNote> {
  const response = await page.request.get(`/api/notes/${id}`, {
    headers: await authenticatedHeaders(page),
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}
async function fileStatus(page: Page, id: string, variant = 'file') {
  return (
    await page.request.get(`/api/attachments/${id}/${variant}`, {
      headers: await authenticatedHeaders(page),
    })
  ).status();
}
const png = (name: string) =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: 'teal' } })
    .png()
    .toBuffer()
    .then((buffer) => ({ name, mimeType: 'image/png', buffer }));

/** Post a note with `clips` recorded clips; returns the note id and the clip names. */
async function postClipNote(page: Page, text: string, clips: number) {
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('textbox', { name: 'Note text' }).fill(text);
  for (let i = 0; i < clips; i++) await recordClip(composer);
  const names = await clipRows(composer).locator('.name').allTextContents();
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  const card = page.getByTestId('posted-note').filter({ hasText: text });
  await expect(card).toHaveCount(1);
  const id = (await card.getAttribute('data-note-id'))!;
  return { id, names };
}
const detailNames = (page: Page) =>
  page.getByTestId('note-detail').getByTestId('voice-clip').locator('.name');

test('a note with 3 clips, text and a photo persists in order and clips are classified as audio', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const text = `three clips ${randomUUID()}`;
  await composer.getByRole('textbox', { name: 'Note text' }).fill(text);
  await page
    .getByLabel('Choose local files')
    .setInputFiles(await png('photo.png'));
  await expect(
    composer.getByRole('list', { name: 'Attachments (1)' }),
  ).toBeVisible();
  for (let i = 0; i < 3; i++) await recordClip(composer);
  const names = await clipRows(composer).locator('.name').allTextContents();
  expect(names).toHaveLength(3);
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);

  const card = page.getByTestId('posted-note').filter({ hasText: text });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('voice-clip').locator('.name')).toHaveText(
    names,
  );
  const note = await getNote(page, (await card.getAttribute('data-note-id'))!);
  // Photo first, then the clips in recording order.
  expect(note.attachmentIds).toHaveLength(4);
  expect(
    (
      await page.request.get(
        `/api/attachments/${note.attachmentIds[0]}/display`,
        {
          headers: await authenticatedHeaders(page),
        },
      )
    ).headers()['content-type'],
  ).toMatch(/^image\//);
  for (const id of note.attachmentIds.slice(1)) {
    const response = await page.request.get(`/api/attachments/${id}/file`, {
      headers: await authenticatedHeaders(page),
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(
      /^audio\/(webm|mp4|ogg)$/,
    );
    expect(response.headers()['content-disposition']).toMatch(/^inline/);
    expect((await response.body()).length).toBeGreaterThan(0);
  }
  // The note page lists the same clips in the same order after a reload.
  await card.locator('a.when').click();
  await expect(page).toHaveURL(/\/notes\//);
  await page.reload();
  await expect(detailNames(page)).toHaveText(names);
});

test('a forced upload failure keeps the clips and the retry creates no duplicates', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const text = `retry clips ${randomUUID()}`;
  await composer.getByRole('textbox', { name: 'Note text' }).fill(text);
  await recordClip(composer);
  await recordClip(composer);
  const names = await clipRows(composer).locator('.name').allTextContents();

  let failures = 0;
  await page.route('**/api/uploads/**', async (route) => {
    if (route.request().method() === 'PUT' && failures++ === 0)
      return route.abort('failed');
    return route.continue();
  });
  const post = composer.getByRole('button', { name: /^(Post|Retry)/ });
  await post.click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  // Nothing was lost and no note exists yet.
  await expect(clipRows(composer)).toHaveCount(2);
  await expect(
    page.getByTestId('posted-note').filter({ hasText: text }),
  ).toHaveCount(0);
  await composer.getByRole('button', { name: /^(Post|Retry)/ }).click();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  expect(failures).toBeGreaterThan(1);

  const card = page.getByTestId('posted-note').filter({ hasText: text });
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('voice-clip').locator('.name')).toHaveText(
    names,
  );
  const found = await page.request.get(`/api/notes?q="${text}"`, {
    headers: await authenticatedHeaders(page),
  });
  const items = (await found.json()).data.items as ApiNote[];
  expect(items).toHaveLength(1);
  expect(items[0].attachmentIds).toHaveLength(2);
});

test('editing a saved note: add, reorder and remove clips; a stale editor still conflicts', async ({
  page,
  browser,
}) => {
  await browserSession(page);
  const text = `edit clips ${randomUUID()}`;
  const { id, names } = await postClipNote(page, text, 2);
  const before = await getNote(page, id);
  expect(before.attachmentIds).toHaveLength(2);

  // A second editor opens the same revision and stays stale.
  const context = await browser.newContext();
  await context.addCookies(await page.context().cookies());
  const stale = await context.newPage();
  await stale.goto(`/notes/${id}`);
  await stale.getByRole('button', { name: 'Edit', exact: true }).click();
  const staleEditor = stale.getByTestId('inline-editor');
  await expect(clipRows(staleEditor)).toHaveCount(2);

  await page.goto(`/notes/${id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByTestId('inline-editor');
  await expect(clipRows(editor)).toHaveCount(2);
  await expect(clipRows(editor).locator('.name')).toHaveText(names);
  await recordClip(editor);
  const all = await clipRows(editor).locator('.name').allTextContents();
  expect(all).toHaveLength(3);
  // Move the new clip to the middle, then remove the first.
  await clipRows(editor)
    .nth(2)
    .getByRole('button', { name: /^Play / })
    .focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(clipRows(editor).locator('.name')).toHaveText([
    all[0],
    all[2],
    all[1],
  ]);
  await clipRows(editor)
    .first()
    .getByRole('button', { name: /^Remove / })
    .click();
  await expect(clipRows(editor).locator('.name')).toHaveText([all[2], all[1]]);
  await editor
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(page.getByTestId('note-detail')).toContainText(
    'Saved on server.',
  );
  await expect(detailNames(page)).toHaveText([all[2], all[1]]);

  const after = await getNote(page, id);
  expect(after.attachmentIds).toHaveLength(2);
  // The kept clip is the original second clip, the new clip sits before it.
  expect(after.attachmentIds[1]).toBe(before.attachmentIds[1]);
  expect(after.attachmentIds).not.toContain(before.attachmentIds[0]);
  expect(after.revision).toBeGreaterThan(before.revision);

  // The stale editor removes a clip and saves: revision conflict, server unchanged.
  await clipRows(staleEditor)
    .first()
    .getByRole('button', { name: /^Remove / })
    .click();
  await staleEditor
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(
    stale.getByRole('dialog', { name: 'Note conflict', exact: true }),
  ).toBeVisible();
  expect((await getNote(page, id)).attachmentIds).toEqual(after.attachmentIds);
  await context.close();
});

test('discarding an edit never deletes server clips', async ({ page }) => {
  await browserSession(page);
  const { id } = await postClipNote(page, `discard clips ${randomUUID()}`, 2);
  const before = await getNote(page, id);
  await page.goto(`/notes/${id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByTestId('inline-editor');
  await expect(clipRows(editor)).toHaveCount(2);
  await clipRows(editor)
    .first()
    .getByRole('button', { name: /^Remove / })
    .click();
  await expect(clipRows(editor)).toHaveCount(1);
  await recordClip(editor);
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Unsaved changes' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(page).toHaveURL(/settings/);
  const after = await getNote(page, id);
  expect(after.attachmentIds).toEqual(before.attachmentIds);
  expect(after.revision).toBe(before.revision);
  for (const clip of before.attachmentIds)
    expect(await fileStatus(page, clip)).toBe(200);
});

test('Trash keeps clips, restore returns them, permanent delete removes the files', async ({
  page,
}) => {
  await browserSession(page);
  const { id, names } = await postClipNote(
    page,
    `trash clips ${randomUUID()}`,
    2,
  );
  const clips = (await getNote(page, id)).attachmentIds;
  const card = page.locator(
    `[data-testid="posted-note"][data-note-id="${id}"]`,
  );
  await card.getByRole('button', { name: 'Note actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(card).toHaveCount(0);
  // In Trash the files are retained (restorable).
  for (const clip of clips) expect(await fileStatus(page, clip)).toBe(200);

  await page.goto('/trash');
  const row = page.locator(`[data-testid="trash-note"][data-note-id="${id}"]`);
  await row.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'Restore selected notes', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Restore notes?' })
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page.goto(`/notes/${id}`);
  await expect(detailNames(page)).toHaveText(names);
  for (const clip of clips) expect(await fileStatus(page, clip)).toBe(200);

  // Trash again and delete permanently.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.goto('/trash');
  await row.getByRole('checkbox').check();
  await page
    .getByRole('button', {
      name: 'Delete selected notes permanently',
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog', { name: 'Delete notes permanently?' })
    .getByRole('button', { name: 'Delete permanently', exact: true })
    .click();
  await expect(row).toHaveCount(0);
  expect(
    (
      await page.request.get(`/api/notes/${id}`, {
        headers: await authenticatedHeaders(page),
      })
    ).status(),
  ).toBe(404);
  // Byte cleanup is queued; the files must stop being served.
  for (const clip of clips)
    await expect
      .poll(() => fileStatus(page, clip), { timeout: 15_000 })
      .toBe(404);
});
