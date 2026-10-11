import { expect, test } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';

test('timeline date picker is themed with site tokens and picks a day and time', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Write a note…' }).click();
  await composer
    .getByRole('textbox', { name: 'Note text' })
    .fill('Dated thought');
  await composer.getByRole('button', { name: 'Set date', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Timeline date',
    exact: true,
  });
  const input = dialog.getByLabel(/Timeline date\/time/);
  await dialog.getByRole('button', { name: 'Choose date and time' }).click();
  const panel = dialog.getByRole('group', { name: 'Date and time picker' });
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
  await panel.getByLabel('Hour').fill('7');
  await panel.getByLabel('Hour').dispatchEvent('change');
  await expect(input).toHaveValue(/-15T07:/);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

test('one editor surface keeps secondary actions in +, switches preview and enters/leaves focus without uploading', async ({
  page,
}, info) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Write a note…' }).click();
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
    composer.getByRole('button', { name: 'Add files' }),
  ).toBeVisible();
  const options = composer.getByRole('group', { name: 'Note options' });
  await expect(options).toBeVisible();
  for (const name of ['Add tag', 'Add files', 'Set date', 'Add location'])
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
