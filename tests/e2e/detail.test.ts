import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  browserSession,
  authenticatedHeaders,
} from '../helpers/browser-session.ts';
import type { NoteSnapshot } from '../../src/lib/shared/domain.ts';

async function create(page: Page): Promise<NoteSnapshot> {
  await browserSession(page);
  const result = await page.request.post('/api/notes', {
    headers: await authenticatedHeaders(page),
    data: {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: `Original ${randomUUID()}`,
        timelineAt: Date.UTC(2020, 0, 1),
        location: null,
        attachmentIds: [],
      },
    },
  });
  expect(result.status()).toBe(200);
  return get(page, (await result.json()).data.noteId);
}
async function get(page: Page, id: string): Promise<NoteSnapshot> {
  const result = await page.request.get(`/api/notes/${id}`, {
    headers: await authenticatedHeaders(page),
  });
  expect(result.status()).toBe(200);
  return (await result.json()).data;
}
async function edit(page: Page, note: NoteSnapshot, body: string) {
  await page.goto(`/notes/${note.id}`);
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  const text = page
    .getByTestId('composer')
    .getByRole('textbox', { name: 'Note text' });
  await expect(text).toBeFocused();
  await text.fill(body);
  return text;
}
async function save(page: Page) {
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
}
const conflict = (page: Page) =>
  page.getByRole('dialog', { name: 'Note conflict', exact: true });

test('private full detail supports direct refresh, no-JS reading and unchanged edits do not prompt', async ({
  page,
  browser,
}) => {
  const note = await create(page);
  await page.goto(`/notes/${note.id}`);
  await expect(page.getByTestId('note-detail')).toContainText(
    note.bodyMarkdown,
  );
  await page.reload();
  await expect(page.getByTestId('note-detail')).toContainText(
    note.bodyMarkdown,
  );
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies(await page.context().cookies());
  const ssr = await context.newPage();
  await ssr.goto(`/notes/${note.id}`);
  await expect(ssr.getByTestId('note-detail')).toContainText(note.bodyMarkdown);
  await context.close();
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await expect(page.getByTestId('composer').getByRole('textbox')).toHaveValue(
    note.bodyMarkdown,
  );
  await expect(
    page.getByRole('button', { name: 'Save changes', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole('dialog', { name: 'Unsaved changes' }),
  ).not.toBeVisible();
});

test('published edit saves files and dates explicitly; reload has no local recovery', async ({
  page,
}) => {
  const note = await create(page);
  await edit(page, note, 'Unsaved edit then reload');
  page.once('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.goto(`/notes/${note.id}`);
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  const text = page.getByTestId('composer').getByRole('textbox');
  await expect(text).toHaveValue(note.bodyMarkdown);
  await text.fill('Explicitly saved edit');
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'edit.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('exact edit bytes'),
  });
  await page
    .getByTestId('composer')
    .getByRole('list', { name: 'Attachments (1)' })
    .waitFor();
  await expect(
    page.getByRole('button', { name: 'Remove edit.mp4', exact: true }),
  ).toBeAttached();
  await save(page);
  await expect(page.getByTestId('composer')).toContainText('Saved on server.');
  const saved = await get(page, note.id);
  expect(saved.bodyMarkdown).toBe('Explicitly saved edit');
  expect(saved.timelineAt).toBe(note.timelineAt);
  expect(saved.createdAt).toBe(note.createdAt);
  expect(saved.contentEditedAt).not.toBeNull();
  const file = await page.request.get(
    `/api/attachments/${saved.attachmentIds[0]}/file`,
    { headers: await authenticatedHeaders(page) },
  );
  expect((await file.body()).toString()).toBe('exact edit bytes');
});

test('concurrent editors keep losing files and conflict copy never overwrites winner', async ({
  page,
  browser,
}) => {
  const note = await create(page);
  const context = await browser.newContext();
  await context.addCookies(await page.context().cookies());
  const second = await context.newPage();
  await edit(page, note, 'Winning edit');
  await edit(second, note, 'Losing edit unique copy');
  await second.getByLabel('Choose local files').setInputFiles({
    name: 'losing.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('losing bytes'),
  });
  await second
    .getByTestId('composer')
    .getByRole('list', { name: 'Attachments (1)' })
    .waitFor();
  await expect(
    second.getByRole('button', { name: 'Remove losing.mp4', exact: true }),
  ).toBeAttached();
  await save(page);
  await expect(page.getByTestId('composer')).toContainText('Saved on server.');
  await save(second);
  await expect(conflict(second)).toContainText('Winning edit');
  await conflict(second)
    .getByRole('button', { name: 'Save local as separate note' })
    .click();
  await second
    .getByRole('button', { name: 'Confirm separate note', exact: true })
    .click();
  await expect(second.getByTestId('composer')).toContainText(
    'Saved on server.',
  );
  expect((await get(page, note.id)).bodyMarkdown).toBe('Winning edit');
  const result = await second.request.get(
    '/api/notes?q="Losing edit unique copy"',
    { headers: await authenticatedHeaders(second) },
  );
  const copies = (await result.json()).data.items;
  expect(copies).toHaveLength(1);
  expect(copies[0].id).not.toBe(note.id);
  const download = await second.request.get(
    `/api/attachments/${copies[0].attachmentIds[0]}/file`,
    { headers: await authenticatedHeaders(second) },
  );
  expect((await download.body()).toString()).toBe('losing bytes');
  await context.close();
});

test('explicit replace racing a third edit conflicts again and preserves losing file bytes', async ({
  page,
  browser,
}) => {
  const note = await create(page);
  const context = await browser.newContext();
  await context.addCookies(await page.context().cookies());
  const second = await context.newPage();
  const text = await edit(second, note, 'Local replacement');
  await second.getByLabel('Choose local files').setInputFiles({
    name: 'race.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('race bytes'),
  });
  await second
    .getByTestId('composer')
    .getByRole('list', { name: 'Attachments (1)' })
    .waitFor();
  await expect(
    second.getByRole('button', { name: 'Remove race.mp4', exact: true }),
  ).toBeAttached();
  await edit(page, note, 'First winner');
  await save(page);
  await expect(page.getByTestId('composer')).toContainText('Saved on server.');
  await save(second);
  await expect(conflict(second)).toBeVisible();
  await conflict(second)
    .getByRole('button', { name: 'Explicitly replace revision 2' })
    .click();
  const current = await get(page, note.id);
  const update = await page.request.patch(`/api/notes/${note.id}`, {
    headers: await authenticatedHeaders(page),
    data: {
      action: 'update',
      mutationId: randomUUID(),
      noteId: note.id,
      expectedRevision: current.revision,
      content: {
        bodyMarkdown: 'Third edit',
        timelineAt: current.timelineAt,
        location: null,
        attachmentIds: [],
      },
    },
  });
  expect(update.status()).toBe(200);
  await second
    .getByRole('button', { name: 'Confirm replace', exact: true })
    .click();
  await expect(conflict(second)).toContainText('Third edit');
  await expect(text).toHaveValue('Local replacement');
  await conflict(second)
    .getByRole('button', { name: 'Explicitly replace revision 3' })
    .click();
  await second
    .getByRole('button', { name: 'Confirm replace', exact: true })
    .click();
  await expect(second.getByTestId('composer')).toContainText(
    'Saved on server.',
  );
  const replaced = await get(page, note.id);
  expect(replaced.revision).toBe(4);
  const download = await page.request.get(
    `/api/attachments/${replaced.attachmentIds[0]}/file`,
    { headers: await authenticatedHeaders(page) },
  );
  expect((await download.body()).toString()).toBe('race bytes');
  await context.close();
});
