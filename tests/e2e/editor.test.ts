import { expect, test } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';

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
  ).not.toBeVisible();
  await expect(
    composer.getByRole('button', { name: 'Date', exact: true }),
  ).not.toBeVisible();
  const plus = composer.getByRole('button', { name: 'Add note options' });
  await plus.click();
  await expect(plus).toHaveAttribute('aria-expanded', 'true');
  const options = composer.getByRole('group', { name: 'Note options' });
  await expect(options).toBeVisible();
  for (const name of ['Tags', 'Add files', 'Date', 'Add location'])
    await expect(
      options.getByRole('button', { name, exact: true }),
    ).toBeVisible();
  const plusBox = (await plus.boundingBox())!;
  const menuBox = (await options.boundingBox())!;
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(plusBox.y);
  await options.getByRole('button', { name: 'Tags', exact: true }).click();
  await expect(text).toBeFocused();
  await expect(text).toHaveValue('**Quiet writing** #');
  await text.fill('**Quiet writing**');
  await plus.focus();
  await plus.press('ArrowDown');
  await expect(options.getByRole('button', { name: 'Tags' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(options).not.toBeVisible();
  await expect(plus).toBeFocused();
  await plus.press('ArrowUp');
  await expect(
    options.getByRole('button', { name: 'Add location' }),
  ).toBeFocused();
  await text.click();
  await expect(options).not.toBeVisible();
  await plus.click();
  await options.getByRole('button', { name: 'Date', exact: true }).click();
  const date = page.getByRole('dialog', { name: 'Timeline date', exact: true });
  const dateInput = date.getByLabel(/Timeline date\/time/);
  await dateInput.fill('9999-01-01T12:00');
  await dateInput.dispatchEvent('change');
  await expect(date.getByRole('alert')).toContainText('now or earlier');
  await page.keyboard.press('Escape');
  await expect(plus).toBeFocused();
  await plus.click();
  await options.getByRole('button', { name: 'Date', exact: true }).click();
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
    focus.getByRole('button', { name: 'Add note options' }),
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
