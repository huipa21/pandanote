import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  authenticatedHeaders,
  browserSession,
} from '../helpers/browser-session.ts';

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

async function expectWhiteTimestampTooltip(page: Page, note: Locator) {
  const when = note.locator('.when');
  const tooltip = note.getByRole('tooltip');
  const originalTheme = await page.locator('html').getAttribute('data-theme');
  await page.emulateMedia({ colorScheme: 'dark' });
  try {
    for (const theme of ['light', 'dark', 'system']) {
      await page.locator('html').evaluate((html, value) => {
        html.dataset.theme = value;
      }, theme);
      for (const trigger of ['hover', 'focus']) {
        await page.mouse.move(0, 0);
        await when.evaluate((node) => node.blur());
        if (trigger === 'hover') await when.hover();
        else await when.focus();
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveCSS(
          'background-color',
          'rgb(255, 255, 255)',
        );
        await expect(tooltip).toHaveCSS('color', 'rgb(36, 43, 37)');
        await expect(tooltip).toContainText('Created');
        await expect(tooltip).toContainText('Updated');
      }
    }
  } finally {
    await page.locator('html').evaluate((html, value) => {
      if (value === null) delete html.dataset.theme;
      else html.dataset.theme = value;
    }, originalTheme);
    await when.evaluate((node) => node.blur());
    await page.emulateMedia({ colorScheme: null });
  }
}

test('Date tooltips stay white on unlabelled cards and note details in every theme', async ({
  page,
}) => {
  const headers = await authenticatedHeaders(page);
  const response = await page.request.post('/api/notes', {
    headers,
    data: {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: unique('Timestamp tooltip'),
        timelineAt: Date.now(),
        attachmentIds: [],
      },
    },
  });
  expect(response.status()).toBe(200);
  const { noteId } = (await response.json()).data;
  await page.goto('/');
  const card = page.locator(`[data-note-id="${noteId}"]`);
  await expectWhiteTimestampTooltip(page, card);
  await card.locator('.when').click();
  await expectWhiteTimestampTooltip(page, page.getByTestId('note-detail'));
});

/** Creates one label through the page's own dialog (color blue, no icon). */
async function createLabel(page: Page, name: string, styled = false) {
  await page.getByRole('button', { name: 'New label' }).click();
  const dialog = page.getByRole('dialog', { name: 'New label' });
  await dialog.getByLabel('Name').fill(name);
  if (styled) {
    await dialog
      .getByRole('radiogroup', { name: 'Header color', exact: true })
      .getByRole('radio', { name: 'Blue', exact: true })
      .click();
    await dialog
      .getByRole('radiogroup', { name: 'Background', exact: true })
      .getByRole('radio', { name: 'Blue', exact: true })
      .click();
  }
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
  const list = page.locator('.label-cloud');
  await list
    .getByRole('link', { name: new RegExp(`^${name}`) })
    .locator('..')
    .getByRole('button', { name: 'Label actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit label' });
  const renamed = `${name} renamed`;
  await editDialog.getByLabel('Name').fill(renamed);
  await editDialog.getByRole('button', { name: 'Save label' }).click();
  await expect(editDialog).toBeHidden();
  await expect(
    list.getByRole('link', { name: new RegExp(`^${renamed}`) }),
  ).toBeVisible();

  // Delete with confirmation.
  await page
    .locator('.label-cloud')
    .getByRole('link', { name: new RegExp(`^${renamed}`) })
    .locator('..')
    .getByRole('button', { name: 'Label actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete label?' });
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(
    list.getByRole('link', { name: new RegExp(`^${renamed}`) }),
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
  await createLabel(page, name, true);
  const search = page.getByRole('searchbox', { name: 'Labels', exact: true });
  await search.fill(name);
  await search.press('Enter');
  await expect(page.locator('.label-cloud > li')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('labels-list.png') });

  await page.goto('/');
  const composer = page.getByTestId('composer');
  const tag = `labeltest${randomUUID().slice(0, 8)}`;
  const body = `Label test ${randomUUID().slice(0, 8)} #${tag}`;
  await composer.getByRole('textbox', { name: 'Note text' }).fill(body);
  const options = composer.getByRole('group', { name: 'Note options' });
  const labelButton = options.getByRole('button', { name: 'Choose a label' });
  await expect(labelButton).toHaveText('');
  await labelButton.click();
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

  const card = page
    .getByTestId('posted-note')
    .filter({ hasText: body.split(' #')[0] });
  await expect(card).toBeVisible();
  await expect(card.getByText(name, { exact: true })).toBeVisible();
  const header = card.locator('header');
  const chip = header.locator('.label-chip');
  const headerBox = (await header.boundingBox())!;
  const chipBox = (await chip.boundingBox())!;
  expect(
    Math.abs(chipBox.x + chipBox.width / 2 - headerBox.x - headerBox.width / 2),
  ).toBeLessThan(2);
  const when = header.locator('.when');
  await when.hover();
  const background = await header.evaluate(
    (node) => getComputedStyle(node).backgroundColor,
  );
  await expect(when).toHaveCSS('background-color', background);
  await expect(header.getByRole('tooltip')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await expectWhiteTimestampTooltip(page, card);
  await when.hover();
  await page.screenshot({
    path: test.info().outputPath('label-card-desktop.png'),
  });

  await when.click();
  const detail = page.getByTestId('note-detail');
  await expect(detail.locator('header .label-chip')).toHaveText(name);
  await detail.locator('.when').hover();
  await expect(detail.locator('.when')).toHaveCSS(
    'background-color',
    background,
  );
  await expectWhiteTimestampTooltip(page, detail);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeader = (await detail.locator('header').boundingBox())!;
  const mobileLabel = (await detail.locator('.label-chip').boundingBox())!;
  expect(
    Math.abs(
      mobileLabel.x +
        mobileLabel.width / 2 -
        mobileHeader.x -
        mobileHeader.width / 2,
    ),
  ).toBeLessThan(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('label-detail-mobile.png'),
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  // Sidebar filter: clicking the label chip shows only notes with that label.
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await sidebar.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/label=/);
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  await expect(page.getByTestId('posted-note')).toContainText(
    body.split(' #')[0],
  );
  await expect(page.locator('.label-header h1')).toHaveText(name);
  await expect(
    page.getByRole('link', { name: 'Remove label filter' }),
  ).toHaveCount(0);
  await sidebar.getByRole('link', { name: new RegExp(`^${name}`) }).click();
  await expect(page).not.toHaveURL(/label=/);
  const tagLink = sidebar.getByRole('link', { name: new RegExp(`^#${tag}`) });
  await tagLink.click();
  await expect(page).toHaveURL(/tag=/);
  await expect(tagLink).toHaveAttribute('aria-current', 'true');
  await tagLink.click();
  await expect(page).not.toHaveURL(/tag=/);
});
