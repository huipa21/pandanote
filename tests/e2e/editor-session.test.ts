import { expect, test } from '@playwright/test';
import {
  browserSession,
  authenticatedHeaders,
} from '../helpers/browser-session.ts';

async function start(page: import('@playwright/test').Page) {
  await browserSession(page);
  await page.goto('/');
  return page
    .getByTestId('composer')
    .getByRole('textbox', { name: 'Note text' });
}
const unsaved = (page: import('@playwright/test').Page) =>
  page.getByRole('dialog', { name: 'Unsaved changes', exact: true });

test('no drafts or recovery storage; navigation supports cancel, discard and post', async ({
  page,
}) => {
  const text = await start(page);
  await expect(
    page.getByRole('link', { name: 'Drafts', exact: true }),
  ).toHaveCount(0);
  await text.fill('Private unsaved session');
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page)
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(text).toHaveValue('Private unsaved session');
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await unsaved(page)
    .getByRole('button', { name: 'Discard', exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.goto('/');
  await text.fill('Post before leaving unique session');
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await unsaved(page)
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  const result = await page.request.get(
    '/api/notes?q="Post before leaving unique session"',
    { headers: await authenticatedHeaders(page) },
  );
  expect((await result.json()).data.items).toHaveLength(1);
  const storage = await page.evaluate(async () => ({
    text: Object.values(localStorage).join(''),
    databases: (await indexedDB.databases()).map((d) => d.name),
  }));
  expect(storage.text).not.toContain('Private unsaved');
  expect(storage.databases).not.toContain('pandanote-draft-blobs');
});

test('tab refresh warns, Stay retains work and Leave drops text/files without posting', async ({
  page,
}) => {
  const text = await start(page);
  await text.fill('Unsubmitted reload text');
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'only.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('local bytes'),
  });
  await page
    .getByTestId('composer')
    .getByRole('list', { name: 'Attachments (1)' })
    .waitFor();
  await expect(
    page
      .getByTestId('composer')
      .getByText('only.mp4', { exact: false })
      .first(),
  ).toBeVisible();
  const stay = page.waitForEvent('dialog');
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  const warning = await stay;
  expect(warning.type()).toBe('beforeunload');
  await warning.dismiss();
  await expect(text).toHaveValue('Unsubmitted reload text');
  const leave = page.waitForEvent('dialog');
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  await (await leave).accept();
  await page.waitForLoadState('domcontentloaded');
  await expect(text).toHaveValue('');
  await expect(page.getByTestId('composer').getByText('only.mp4')).toHaveCount(
    0,
  );
});

test('mobile editor close prompts and empty editor closes without a prompt', async ({
  page,
}) => {
  await browserSession(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Compose a note' }).click();
  const editor = page.getByRole('dialog', {
    name: 'Write a note',
    exact: true,
  });
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();
  await expect(unsaved(page)).not.toBeVisible();
  await page.getByRole('button', { name: 'Compose a note' }).click();
  await editor.getByRole('textbox').fill('Mobile unsaved');
  await editor.getByRole('button', { name: 'Close Write a note' }).click();
  await expect(unsaved(page)).toBeVisible();
  await unsaved(page)
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(editor.getByRole('textbox')).toHaveValue('Mobile unsaved');
  await page.keyboard.press('Escape');
  await unsaved(page)
    .getByRole('button', { name: 'Discard', exact: true })
    .click();
  await expect(editor).not.toBeVisible();
});

test('failed post from exit dialog retains content and destination is not visited', async ({
  page,
}) => {
  const text = await start(page);
  await text.fill('Retain after failed exit save');
  await page.route('**/api/notes', (route) =>
    route.request().method() === 'POST'
      ? route.abort('failed')
      : route.continue(),
  );
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Trash', exact: true })
    .click();
  await unsaved(page)
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(unsaved(page).getByRole('alert')).not.toBeEmpty();
  await expect(page).toHaveURL(/\/$/);
  await unsaved(page)
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  await expect(text).toHaveValue('Retain after failed exit save');
});
