import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { browserSession } from '../helpers/browser-session.ts';

test('timeline date picker is themed with site tokens and picks a day and time', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer
    .getByRole('textbox', { name: 'Note text' })
    .fill('Dated thought');
  await composer.getByRole('button', { name: 'Set date', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Timeline date',
    exact: true,
  });
  const input = dialog.getByLabel(/Timeline date\/time/);
  const panel = dialog.getByRole('group', { name: 'Date and time picker' });
  await expect(panel).toBeVisible();
  // Calendar and text bar only: no close button, no title text, no time fields or Done.
  await expect(dialog.getByRole('button', { name: /Close/ })).toHaveCount(0);
  await expect(dialog.locator('header')).toHaveCount(0); // title is screen-reader-only
  await expect(panel.getByRole('button', { name: 'Done' })).toHaveCount(0);
  await expect(panel.getByLabel('Hour')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Choose date and time' }),
  ).toHaveCount(0);
  await panel.getByRole('button', { name: 'Previous month' }).click();
  await panel.getByRole('button', { name: /-15$/ }).click();
  await expect(panel.getByRole('button', { name: /-15$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await panel
      .getByRole('button', { name: /-15$/ })
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(
    await page.evaluate(() => {
      const probe = document.createElement('i');
      probe.style.color = 'var(--accent)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }),
  );
  await input.fill((await input.inputValue()).replace(/T\d\d:/, 'T07:'));
  await input.dispatchEvent('change');
  await expect(input).toHaveValue(/-15T07:/);
  // The text bar and the calendar have the same width.
  const inputBox = (await input.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(Math.abs(inputBox.width - panelBox.width)).toBeLessThan(2);
  // Nothing is shown in the composer until the date is saved.
  const chip = composer.locator('time.date-chip');
  await expect(chip).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('datetime', /-15T07:/);
  // Unsaved changes are discarded by clicking outside the dialog.
  await composer.getByRole('button', { name: 'Set date', exact: true }).click();
  await panel.getByRole('button', { name: /-10$/ }).click();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
  await expect(chip).toHaveAttribute('datetime', /-15T07:/);
});

test('media picker accepts only photos or one video and limits a note to nine photos', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const input = page.getByLabel('Choose local files');
  await expect(input).toHaveAttribute('accept', 'image/*,video/*');
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: 'teal' },
  })
    .png()
    .toBuffer();
  const photo = (name: string) => ({
    name,
    mimeType: 'image/png',
    buffer: png,
  });
  const video = (name: string) => ({
    name,
    mimeType: 'video/mp4',
    buffer: Buffer.from('video bytes'),
  });
  const alert = page.getByRole('alert').first();

  await input.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('text'),
  });
  await expect(composer.getByRole('list', { name: 'Files (1)' })).toBeVisible();
  await expect(alert).toHaveCount(0);
  await composer
    .getByRole('button', { name: 'Remove notes.txt', exact: true })
    .click();

  await input.setInputFiles(
    Array.from({ length: 9 }, (_, i) => photo(`p${i}.png`)),
  );
  const grid = (count: number) =>
    composer.getByRole('list', { name: `Attachments (${count})` });
  await expect(grid(9)).toBeVisible();
  await expect(grid(9).getByRole('listitem')).toHaveCount(9);
  await input.setInputFiles(photo('tenth.png'));
  await expect(alert).toContainText('at most 9 photos');
  await expect(grid(9)).toBeVisible();
  await input.setInputFiles(video('clip.mp4'));
  await expect(alert).toContainText('cannot be combined with photos');

  for (let i = 0; i < 9; i++)
    await composer
      .getByRole('button', { name: `Remove p${i}.png`, exact: true })
      .click();
  await input.setInputFiles([video('one.mp4'), video('two.mp4')]);
  await expect(alert).toContainText('only one video');
  await input.setInputFiles(video('one.mp4'));
  await expect(grid(1)).toBeVisible();
  await expect(alert).toHaveCount(0);
  await input.setInputFiles(photo('after-video.png'));
  await expect(alert).toContainText('cannot also have photos');
  await input.setInputFiles(video('second.mp4'));
  await expect(alert).toContainText('cannot be combined with photos');
});

test('attach-file picker accepts any file type and shows an extension icon', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const input = page.getByLabel('Choose any file');
  await expect(input).not.toHaveAttribute('accept');
  await composer.getByRole('button', { name: 'Attach file' }).click();

  await input.setInputFiles([
    {
      name: 'report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') },
  ]);
  const list = composer.getByRole('list', { name: 'Files (2)' });
  await expect(list).toBeVisible();
  const items = list.getByRole('listitem');
  await expect(items).toHaveCount(2);
  await expect(
    items
      .filter({ hasText: 'report.pdf' })
      .locator('svg[data-file-icon="pdf"]'),
  ).toHaveCount(1);
  await expect(
    items
      .filter({ hasText: 'notes.txt' })
      .locator('svg[data-file-icon="text"]'),
  ).toHaveCount(1);

  await composer.getByRole('button', { name: 'Remove notes.txt' }).click();
  await expect(composer.getByRole('list', { name: 'Files (1)' })).toBeVisible();
});

test('photos show as a 3-column thumbnail grid, reorder by drag, remove with X and upload only on Post', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('textbox', { name: 'Note text' }).fill('Grid');
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() !== 'GET' &&
      /\/api\/(uploads|notes)/.test(request.url())
    )
      uploads.push(request.url());
  });
  const colors = ['teal', 'orange', 'purple', 'red'];
  const files = await Promise.all(
    colors.map(async (background, i) => ({
      name: `c${i}.png`,
      mimeType: 'image/png',
      buffer: await sharp({
        create: { width: 32, height: 32, channels: 3, background },
      })
        .png()
        .toBuffer(),
    })),
  );
  await page.getByLabel('Choose local files').setInputFiles(files);
  const grid = composer.getByRole('list', { name: 'Attachments (4)' });
  await expect(grid.locator('img')).toHaveCount(4);
  await expect(
    composer.getByRole('textbox', { name: 'Note text' }),
  ).toHaveValue('Grid');
  const lefts = await grid
    .getByRole('listitem')
    .evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().left)),
    );
  expect(new Set(lefts).size).toBe(3);
  const names = () =>
    composer
      .getByRole('list', { name: /^Attachments/ })
      .getByRole('button', { name: /^c\d\.png, / })
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute('aria-label')!.split(',')[0]),
      );
  expect(await names()).toEqual(['c0.png', 'c1.png', 'c2.png', 'c3.png']);

  await grid
    .getByRole('listitem')
    .nth(0)
    .dragTo(grid.getByRole('listitem').nth(2));
  expect(await names()).toEqual(['c1.png', 'c2.png', 'c0.png', 'c3.png']);

  await grid.getByRole('button', { name: /^c3\.png, / }).press('Alt+ArrowLeft');
  expect(await names()).toEqual(['c1.png', 'c2.png', 'c3.png', 'c0.png']);

  await composer.getByRole('button', { name: 'Remove c2.png' }).click();
  await expect(
    composer.getByRole('list', { name: 'Attachments (3)' }),
  ).toBeVisible();
  expect(await names()).toEqual(['c1.png', 'c3.png', 'c0.png']);
  expect(uploads).toEqual([]);

  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  const posted = page.getByTestId('posted-note').first();
  await expect(posted.getByRole('list', { name: 'Note images' })).toBeVisible();
  await expect(
    posted.getByRole('button', { name: /^Open image \d: / }),
  ).toHaveCount(3);
  expect(uploads.length).toBeGreaterThan(0);
});

test('one editor surface keeps secondary actions in +, switches preview and enters/leaves focus without uploading', async ({
  page,
}, info) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const text = composer.getByRole('textbox', { name: 'Note text' });
  await text.fill('**Quiet writing**');
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() !== 'GET' &&
      /\/api\/(notes|uploads)/.test(request.url())
    )
      mutations.push(request.url());
  });
  await expect(
    composer.getByRole('button', { name: 'Add photos or video' }),
  ).toBeVisible();
  const options = composer.getByRole('group', { name: 'Note options' });
  await expect(options).toBeVisible();
  await expect(options.getByRole('button')).toHaveCount(7);
  for (const name of [
    'Add tag',
    'Insert template',
    'Choose a label',
    'Add photos or video',
    'Attach file',
    'Record a voice clip',
    'Set date',
  ])
    await expect(
      options.getByRole('button', { name, exact: true }),
    ).toBeVisible();
  const optionsBox = (await options.boundingBox())!;
  const postBox = (await composer
    .getByRole('button', { name: 'Post', exact: true })
    .boundingBox())!;
  const focusBox = (await composer
    .getByRole('button', { name: 'Enter focus mode' })
    .boundingBox())!;
  const textBox = (await text.boundingBox())!;
  expect(optionsBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height);
  expect(focusBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height);
  expect(focusBox.x + focusBox.width).toBeLessThanOrEqual(postBox.x);
  await options.getByRole('button', { name: 'Add tag', exact: true }).click();
  await expect(text).toBeFocused();
  await expect(text).toHaveValue('**Quiet writing** #');
  await text.fill('**Quiet writing**');
  const dateButton = options.getByRole('button', {
    name: 'Set date',
    exact: true,
  });
  await dateButton.click();
  const date = page.getByRole('dialog', { name: 'Timeline date', exact: true });
  const dateInput = date.getByLabel(/Timeline date\/time/);
  await dateInput.fill('9999-01-01T12:00');
  await dateInput.dispatchEvent('change');
  await expect(date.getByRole('alert')).toContainText('now or earlier');
  await expect(
    date.getByRole('button', { name: 'Save', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dateButton).toBeFocused();
  await dateButton.click();
  await expect(date.getByRole('alert')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const preview = composer.getByRole('switch', { name: 'Preview' });
  await preview.click();
  await expect(preview).toBeChecked();
  await expect(composer.locator('.compact-preview strong')).toHaveText(
    'Quiet writing',
  );
  await page.screenshot({
    path: info.outputPath('concise-editor-preview.png'),
  });
  const focusButton = composer.getByRole('button', {
    name: 'Enter focus mode',
  });
  await focusButton.click();
  const focus = page.getByRole('dialog', { name: 'Write a note', exact: true });
  await expect(focus).toBeVisible();
  await expect(focus.locator('.expanded-preview strong')).toHaveText(
    'Quiet writing',
  );
  await focus.getByRole('switch', { name: 'Preview' }).click();
  await expect(focus.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    '**Quiet writing**',
  );
  const container = (await focus.locator('.editor-container').boundingBox())!;
  for (const control of [
    focus.getByRole('group', { name: 'Note options' }),
    focus.getByRole('switch', { name: 'Preview' }),
    focus.getByRole('button', { name: 'Post', exact: true }),
    focus.getByRole('button', { name: 'Close Write a note' }),
  ]) {
    const box = (await control.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(container.x);
    expect(box.y).toBeGreaterThanOrEqual(container.y);
    expect(box.x + box.width).toBeLessThanOrEqual(
      container.x + container.width,
    );
    expect(box.y + box.height).toBeLessThanOrEqual(
      container.y + container.height,
    );
  }
  await page.screenshot({ path: info.outputPath('concise-editor-focus.png') });
  await focus.getByRole('button', { name: 'Close Write a note' }).click();
  await expect(focus).not.toBeVisible();
  await expect(focusButton).toBeFocused();
  await expect(text).toHaveValue('**Quiet writing**');
  expect(mutations).toEqual([]);
});
