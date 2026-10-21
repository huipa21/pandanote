import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { card, create, openMenu, pick } from './note-actions-helpers.ts';

test('NA-EDIT: card Edit opens an in-place editor; Save changes keeps position; Cancel asks only for changes', async ({
  page,
}) => {
  const tag = `ed${Date.now().toString(36)}`;
  const id = await create(page, `Inline original ${tag}`);
  await page.goto('/');
  const c = card(page, id);
  const index = () =>
    c.evaluate((el) => [...el.parentElement!.children].indexOf(el));
  const before = await index();
  await openMenu(page, id);
  await pick(page, 'Edit');
  const editor = c.getByTestId('inline-editor');
  await expect(editor).toBeVisible();
  const text = editor.getByRole('textbox', { name: 'Note text' });
  await expect(text).toBeFocused();
  await expect(text).toHaveValue(`Inline original ${tag}`);
  // The top composer is replaced by the inline editor while a card is edited.
  await expect(page.getByTestId('composer')).toHaveCount(0);
  // Unchanged Cancel closes silently and returns focus to the trigger.
  await editor.getByRole('button', { name: 'Cancel' }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(c.getByRole('button', { name: 'Note actions' })).toBeFocused();
  // Cancel with changes offers Discard / Keep editing.
  await openMenu(page, id);
  await pick(page, 'Edit');
  await text.fill('Changed but cancelled');
  await editor.getByRole('button', { name: 'Cancel' }).click();
  await editor.getByRole('button', { name: 'Keep editing' }).click();
  await expect(text).toHaveValue('Changed but cancelled');
  await editor.getByRole('button', { name: 'Cancel' }).click();
  await editor.getByRole('button', { name: 'Discard' }).click();
  await expect(c).toContainText(`Inline original ${tag}`);
  // Save changes in place.
  await openMenu(page, id);
  await pick(page, 'Edit');
  await text.fill(`Inline saved ${tag}`);
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(c).toContainText(`Inline saved ${tag}`);
  await expect(c.getByTestId('inline-editor')).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  expect(await index()).toBe(before);
});

test('NA-EDIT: edits in a tag view; clicking another card saves the dirty edit without asking', async ({
  page,
}) => {
  const tag = `sw${Date.now().toString(36)}`;
  const a = await create(page, `Switch A #${tag}`);
  const b = await create(page, `Switch B #${tag}`);
  await page.goto(`/?tag=${tag}`);
  await openMenu(page, a);
  await pick(page, 'Edit');
  const text = card(page, a).getByRole('textbox', { name: 'Note text' });
  await text.fill(`Switch A edited #${tag}`);
  await openMenu(page, b);
  await pick(page, 'Edit');
  await expect(card(page, b).getByTestId('inline-editor')).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Unsaved changes' }),
  ).toHaveCount(0);
  await expect(card(page, a)).toContainText('Switch A edited');
  await expect(card(page, a)).toHaveAttribute('data-revision', '2');
  await expect(card(page, a).getByTestId('inline-editor')).toHaveCount(0);
});

test('NA-EDIT: double-click edits the card text; clicking outside saves or closes without asking', async ({
  page,
}) => {
  const tag = `dc${Date.now().toString(36)}`;
  const a = await create(page, `Double A #${tag}`);
  const b = await create(page, `Double B #${tag}`);
  await page.goto(`/?tag=${tag}`);
  const c = card(page, a);
  const editor = c.getByTestId('inline-editor');
  const text = editor.getByRole('textbox', { name: 'Note text' });
  // Unchanged: an outside click just closes the editor.
  await c.locator('.card-content').dblclick();
  await expect(text).toBeFocused();
  await expect(text).toHaveValue(`Double A #${tag}`);
  await page.locator('h1').first().click();
  await expect(editor).toHaveCount(0);
  await expect(c).toHaveAttribute('data-revision', '1');
  // Changed: an outside click saves in place, no dialog.
  await c.locator('.card-content').dblclick();
  await text.fill(`Double A saved #${tag}`);
  await page.locator('h1').first().click();
  await expect(editor).toHaveCount(0);
  await expect(c).toContainText('Double A saved');
  await expect(c).toHaveAttribute('data-revision', '2');
  // A body that cannot be saved (empty) keeps the editor open.
  await c.locator('.card-content').dblclick();
  await text.fill('');
  await page.locator('h1').first().click();
  await expect(text).toBeVisible();
  await text.fill(`Double A linked #${tag}`);
  // Clicking a link outside saves first, then follows the link without asking.
  await card(page, b)
    .getByRole('link', { name: `#${tag}` })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('dialog', { name: 'Unsaved changes' }),
  ).toHaveCount(0);
  await expect(card(page, a)).toContainText('Double A linked');
  await expect(card(page, a)).toHaveAttribute('data-revision', '3');
});

test('NA-EDIT: typed composer text prompts before a card edit opens', async ({
  page,
}) => {
  const id = await create(page, `Composer guard ${randomUUID()}`);
  await page.goto('/');
  await page
    .getByTestId('composer')
    .getByRole('textbox')
    .fill('Unposted composer text');
  await openMenu(page, id);
  await pick(page, 'Edit');
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card(page, id).getByTestId('inline-editor')).toHaveCount(0);
  await expect(page.getByTestId('composer').getByRole('textbox')).toHaveValue(
    'Unposted composer text',
  );
});

test('NA-EDIT: focus mode round trip on a card at 390 px', async ({ page }) => {
  const id = await create(page, `Focus trip ${randomUUID()}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMenu(page, id);
  await pick(page, 'Edit');
  const inline = card(page, id).getByTestId('inline-editor');
  await expect(inline).toBeVisible();
  await inline.getByRole('textbox').fill('Focus text kept');
  await inline.getByRole('button', { name: 'Enter focus mode' }).click();
  const focus = page.getByRole('dialog', { name: 'Edit note' });
  await expect(focus.getByRole('textbox')).toHaveValue('Focus text kept');
  await focus.getByRole('button', { name: 'Close Edit note' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Unsaved changes' }),
  ).toHaveCount(0);
  await expect(inline.getByRole('textbox')).toHaveValue('Focus text kept');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('NA-EDIT: the note page edits in place and leaving with changes prompts', async ({
  page,
}) => {
  const id = await create(page, `Page edit ${randomUUID()}`);
  await page.goto(`/notes/${id}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByTestId('inline-editor');
  await editor.getByRole('textbox').fill('Page edit saved');
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(`/notes/${id}`);
  await expect(page.getByTestId('note-detail')).toContainText(
    'Page edit saved',
  );
  await expect(page.getByTestId('note-detail')).toHaveAttribute(
    'data-revision',
    '2',
  );
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByTestId('inline-editor').getByRole('textbox').fill('Unsaved');
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Unsaved changes' }),
  ).toBeVisible();
});
