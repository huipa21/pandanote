import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);

async function axeViolations(page: Page) {
  await page.evaluate(axeSource);
  return page.evaluate(async () =>
    (
      await (
        window as unknown as {
          axe: {
            run: (
              context: Document,
              options: unknown,
            ) => Promise<{ violations: { id: string; nodes: unknown[] }[] }>;
          };
        }
      ).axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
        resultTypes: ['violations'],
      })
    ).violations.map((v) => ({ id: v.id, nodes: v.nodes.length })),
  );
}

const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

/** Creates one label through the page's own dialog (color blue, no icon). */
async function createLabel(page: Page, name: string) {
  await page.getByRole('button', { name: 'New label' }).click();
  const dialog = page.getByRole('dialog', { name: 'New label' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Save label' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
}

test('Labels page: sidebar entry, create, edit, delete', async ({ page }) => {
  await browserSession(page);
  const name = unique('Garden');
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await sidebar.getByRole('link', { name: 'Labels', exact: true }).click();
  await expect(page).toHaveURL(/\/labels$/);
  await createLabel(page, name);

  // Edit: open the row, rename, save.
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit label' });
  const renamed = `${name} renamed`;
  await editDialog.getByLabel('Name').fill(renamed);
  await editDialog.getByRole('button', { name: 'Save label' }).click();
  await expect(editDialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: new RegExp(`^${renamed}`) }),
  ).toBeVisible();

  // Delete with confirmation.
  await page
    .getByRole('button', { name: new RegExp(`^${renamed}`) })
    .locator('..')
    .getByRole('button', { name: 'Label actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete label?' });
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`^${renamed}`) }),
  ).toHaveCount(0);
});

test('New label dialog: swatch/icon radio groups and preview have no axe WCAG 2.x AA violations', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/labels');
  await page.getByRole('button', { name: 'New label' }).click();
  const dialog = page.getByRole('dialog', { name: 'New label' });
  await dialog.getByLabel('Name').fill(unique('Accessible'));
  await dialog
    .getByRole('radiogroup', { name: 'Color', exact: true })
    .getByRole('radio', { name: 'Green' })
    .click();
  await dialog.getByRole('radio', { name: 'Star' }).click();
  expect(await axeViolations(page)).toEqual([]);
});

test('Composer: pick a label, post, see the chip on the card, filter from the sidebar', async ({
  page,
}) => {
  await browserSession(page);
  const name = unique('Urgent');
  await page.goto('/labels');
  await createLabel(page, name);

  await page.goto('/');
  const composer = page.getByTestId('composer');
  const body = `Label test ${randomUUID().slice(0, 8)}`;
  await composer.getByRole('textbox', { name: 'Note text' }).fill(body);
  await composer.getByRole('button', { name: 'Choose a label' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a label' });
  await picker.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(picker).toBeHidden();

  let writes = 0;
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/notes'))
      writes++;
  });
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect.poll(() => writes).toBe(1);

  const card = page.getByTestId('posted-note').filter({ hasText: body });
  await expect(card).toBeVisible();
  await expect(card.getByText(name, { exact: true })).toBeVisible();

  // Sidebar filter: clicking the label chip shows only notes with that label.
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await sidebar.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/label=/);
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  await expect(page.getByTestId('posted-note')).toContainText(body);
});
