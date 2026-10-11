import { expect, test } from '@playwright/test';
import {
  browserSession,
  authenticatedHeaders,
} from '../helpers/browser-session.ts';

async function start(page: import('@playwright/test').Page, text: string) {
  await browserSession(page);
  await page.goto('/');
  await page.getByTestId('composer').getByRole('textbox').fill(text);
}
const composer = (page: import('@playwright/test').Page) =>
  page.getByTestId('composer');

test('Post uploads text/video explicitly, confirms once and leaves no browser persistence', async ({
  page,
}) => {
  await start(page, 'Explicit media post unique');
  const writes: string[] = [];
  page.on('request', (r) => {
    if (/\/api\/(uploads|notes)/.test(r.url()) && r.method() !== 'GET')
      writes.push(r.url());
  });
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('exact file bytes'),
  });
  await composer(page).getByRole('list', { name: 'Attachments (1)' }).waitFor();
  await expect(
    composer(page).getByRole('button', {
      name: 'Remove clip.mp4',
      exact: true,
    }),
  ).toBeAttached();
  expect(writes).toEqual([]);
  const text = composer(page).getByRole('textbox');
  await text.press('Control+Enter');
  expect(writes).toEqual([]);
  await composer(page)
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(composer(page).getByRole('textbox')).toHaveValue('');
  await expect(text).toHaveValue('');
  const result = await page.request.get(
    '/api/notes?q="Explicit media post unique"',
    { headers: await authenticatedHeaders(page) },
  );
  const items = (await result.json()).data.items;
  expect(items).toHaveLength(1);
  const note = (
    await (
      await page.request.get(`/api/notes/${items[0].id}`, {
        headers: await authenticatedHeaders(page),
      })
    ).json()
  ).data;
  expect(note.attachments.map((a: { kind: string }) => a.kind)).toEqual([
    'file',
  ]);
  const bytes = await page.request.get(
    `/api/attachments/${note.attachmentIds[0]}/file`,
    { headers: await authenticatedHeaders(page) },
  );
  expect((await bytes.body()).toString()).toBe('exact file bytes');
});

test('lost response after commit retries the same receipt without duplicate note or file', async ({
  page,
}) => {
  await start(page, 'Uncertain committed note unique');
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'retry.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('retry bytes'),
  });
  await composer(page).getByRole('list', { name: 'Attachments (1)' }).waitFor();
  await expect(
    composer(page).getByRole('button', {
      name: 'Remove retry.mp4',
      exact: true,
    }),
  ).toBeAttached();
  await page.route(
    '**/api/notes',
    async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fetch();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await composer(page)
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(composer(page).getByRole('alert')).not.toBeEmpty();
  await expect(composer(page).getByRole('textbox')).toHaveValue(
    'Uncertain committed note unique',
  );
  await composer(page)
    .getByRole('button', { name: 'Check and retry save', exact: true })
    .click();
  await expect(composer(page).getByRole('textbox')).toHaveValue('');
  const result = await page.request.get(
    '/api/notes?q="Uncertain committed note unique"',
    { headers: await authenticatedHeaders(page) },
  );
  expect((await result.json()).data.items).toHaveLength(1);
});

test('failure before upload permits editable retry with remapped IDs and preserved file bytes', async ({
  page,
}) => {
  await start(page, 'Retry before uploads unique');
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'retry-before.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('before bytes'),
  });
  await composer(page).getByRole('list', { name: 'Attachments (1)' }).waitFor();
  await expect(
    composer(page).getByRole('button', {
      name: 'Remove retry-before.mp4',
      exact: true,
    }),
  ).toBeAttached();
  await page.route('**/api/uploads', (route) => route.abort('failed'), {
    times: 1,
  });
  await composer(page)
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(composer(page).getByRole('alert')).not.toBeEmpty();
  await composer(page)
    .getByRole('button', { name: 'Edit as new note', exact: true })
    .click();
  await composer(page)
    .getByRole('textbox')
    .fill('Retry edited before uploads unique');
  await composer(page)
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect
    .poll(async () => {
      const found = await page.request.get(
        '/api/notes?q="Retry edited before uploads unique"',
        { headers: await authenticatedHeaders(page) },
      );
      return ((await found.json()).data.items as unknown[]).length;
    })
    .toBe(1);
  const result = await page.request.get(
    '/api/notes?q="Retry edited before uploads unique"',
    { headers: await authenticatedHeaders(page) },
  );
  const items = (await result.json()).data.items;
  expect(items).toHaveLength(1);
  const bytes = await page.request.get(
    `/api/attachments/${items[0].attachmentIds[0]}/file`,
    { headers: await authenticatedHeaders(page) },
  );
  expect((await bytes.body()).toString()).toBe('before bytes');
});
