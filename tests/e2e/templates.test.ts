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

/** Creates one template through the page's own dialog. */
async function createTemplate(page: Page, name: string, body: string) {
  await page.getByRole('button', { name: 'New template' }).click();
  const dialog = page.getByRole('dialog', { name: 'New template' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Template text').fill(body);
  await dialog.getByRole('button', { name: 'Save template' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: new RegExp(`^${name}`) }),
  ).toBeVisible();
}

test('Templates page: sidebar entry, create, search, edit and conflict-free save', async ({
  page,
}) => {
  await browserSession(page);
  const name = unique('Weekly review');
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await sidebar.getByRole('link', { name: 'Templates' }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(
    page.getByRole('heading', { name: 'Templates', level: 1 }),
  ).toBeVisible();

  await createTemplate(page, name, '## Goals\n- rest');
  // Search matches body text too, and clearing it restores the list.
  const search = page.getByRole('searchbox', { name: 'Search templates' });
  await search.fill('goals');
  await expect(
    page.getByRole('button', { name: new RegExp(`^${name}`) }),
  ).toBeVisible();
  await search.fill(`no-match-${randomUUID()}`);
  await expect(page.getByText('No templates match your search.')).toBeVisible();
  await search.fill('');

  // Clicking the template opens it for editing with its current text.
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  const editor = page.getByRole('dialog', { name: 'Edit template' });
  await expect(editor.getByLabel('Template text')).toHaveValue(
    '## Goals\n- rest',
  );
  await editor.getByLabel('Template text').fill('## Goals\n- rest\n- sleep');
  await editor.getByRole('button', { name: 'Save template' }).click();
  await expect(editor).toBeHidden();

  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Edit template' })
      .getByLabel('Template text'),
  ).toHaveValue('## Goals\n- rest\n- sleep');
  await page
    .getByRole('dialog', { name: 'Edit template' })
    .getByRole('button', { name: 'Cancel' })
    .click();

  expect(await axeViolations(page)).toEqual([]);
});

test('Templates page: duplicate names are refused and multi-select delete removes only chosen templates', async ({
  page,
}) => {
  await browserSession(page);
  const keep = unique('Keep me');
  const drop = unique('Drop me');
  await page.goto('/templates');
  await createTemplate(page, keep, 'keep text');
  await createTemplate(page, drop, 'drop text');

  // A second template with the same name in another letter case is refused.
  await page.getByRole('button', { name: 'New template' }).click();
  const dialog = page.getByRole('dialog', { name: 'New template' });
  await dialog.getByLabel('Name').fill(keep.toUpperCase());
  await dialog.getByLabel('Template text').fill('again');
  await dialog.getByRole('button', { name: 'Save template' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'A template with this name already exists.',
  );
  // Cancel with unsaved text asks first; discarding closes the dialog.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('checkbox', { name: `Select template ${drop}` }).check();
  await expect(page.getByText('1 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Delete selected templates' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete templates?' });
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(`^${drop}`) }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: new RegExp(`^${keep}`) }),
  ).toBeVisible();
});

test('Composer: insert a template into the note text, then post it as an ordinary note', async ({
  page,
}) => {
  await browserSession(page);
  const name = unique('Standup');
  // Cards hide hashtag tokens, so the check below uses plain words.
  const body = `Standup ${randomUUID().slice(0, 8)} daily check-in`;
  await page.goto('/templates');
  await createTemplate(page, name, body);

  await page.goto('/');
  const composer = page.getByTestId('composer');
  const text = composer.getByRole('textbox', { name: 'Note text' });
  await text.fill('Already written');
  await composer.getByRole('button', { name: 'Insert template' }).click();
  const picker = page.getByRole('dialog', { name: 'Template', exact: true });
  await picker.getByRole('searchbox', { name: 'Search templates' }).fill(name);
  await picker.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(picker).toBeHidden();

  await expect(text).toHaveValue(`Already written\n\n${body}`);

  // Insertion alone does not write to the server; Post does.
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() !== 'GET' && request.url().includes('/api/notes'))
      writes++;
  });
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  // The posted card (not the picker's closed list) shows the inserted text.
  await expect(
    page.getByTestId('posted-note').filter({ hasText: body }),
  ).toBeVisible();
});

test('Template editor: a default label fills in the note header on insert but never overrides an existing pick', async ({
  page,
}) => {
  await browserSession(page);
  const labelName = unique('Routine');
  const templateName = unique('Daily');
  const otherLabelName = unique('Other');
  const body = `Routine ${randomUUID().slice(0, 8)} body text`;

  await page.goto('/labels');
  await page.getByRole('button', { name: 'New label' }).click();
  const newLabel = page.getByRole('dialog', { name: 'New label' });
  await newLabel.getByLabel('Name').fill(labelName);
  await newLabel.getByRole('button', { name: 'Save label' }).click();
  await expect(newLabel).toBeHidden();
  await page.getByRole('button', { name: 'New label' }).click();
  const otherLabel = page.getByRole('dialog', { name: 'New label' });
  await otherLabel.getByLabel('Name').fill(otherLabelName);
  await otherLabel.getByRole('button', { name: 'Save label' }).click();
  await expect(otherLabel).toBeHidden();

  await page.goto('/templates');
  await page.getByRole('button', { name: 'New template' }).click();
  const dialog = page.getByRole('dialog', { name: 'New template' });
  await dialog.getByLabel('Name').fill(templateName);
  await dialog.getByLabel('Template text').fill(body);
  await dialog.getByRole('button', { name: 'Choose a label' }).click();
  const templateLabelPicker = page.getByRole('dialog', {
    name: 'Choose a label',
  });
  await templateLabelPicker
    .getByRole('button', { name: new RegExp(`^${labelName}`) })
    .click();
  await expect(templateLabelPicker).toBeHidden();
  await expect(dialog.getByText(labelName, { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Save template' }).click();
  await expect(dialog).toBeHidden();

  // A note with no label yet: inserting the template fills in its default label.
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Insert template' }).click();
  const picker = page.getByRole('dialog', { name: 'Template', exact: true });
  await picker
    .getByRole('searchbox', { name: 'Search templates' })
    .fill(templateName);
  await picker
    .getByRole('button', { name: new RegExp(`^${templateName}`) })
    .click();
  await expect(picker).toBeHidden();
  await expect(
    composer.getByRole('button', { name: `Label: ${labelName}` }),
  ).toBeVisible();

  // Starting over and picking a label by hand first: the template never
  // overrides that explicit choice.
  await composer.getByRole('textbox', { name: 'Note text' }).fill('');
  await page.reload();
  const freshComposer = page.getByTestId('composer');
  await freshComposer.getByRole('button', { name: 'Choose a label' }).click();
  const picked = page.getByRole('dialog', { name: 'Choose a label' });
  await picked
    .getByRole('button', { name: new RegExp(`^${otherLabelName}`) })
    .click();
  await expect(picked).toBeHidden();
  await freshComposer.getByRole('button', { name: 'Insert template' }).click();
  const picker2 = page.getByRole('dialog', { name: 'Template', exact: true });
  await picker2
    .getByRole('searchbox', { name: 'Search templates' })
    .fill(templateName);
  await picker2
    .getByRole('button', { name: new RegExp(`^${templateName}`) })
    .click();
  await expect(picker2).toBeHidden();
  await expect(
    freshComposer.getByRole('button', { name: `Label: ${otherLabelName}` }),
  ).toBeVisible();
});

test('Composer: a label can be created on the spot from the label picker and is used immediately', async ({
  page,
}) => {
  await browserSession(page);
  const name = unique('Fresh label');
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Choose a label' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a label' });
  await picker.getByLabel('New label name').fill(name);
  await picker.getByRole('button', { name: 'Create' }).click();
  await expect(picker).toBeHidden();
  await expect(
    composer.getByRole('button', { name: `Label: ${name}` }),
  ).toBeVisible();

  // It is now also available on the Labels page, created with no extra steps.
  await page.goto('/labels');
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});
