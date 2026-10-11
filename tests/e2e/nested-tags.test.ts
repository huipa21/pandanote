import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import {
  browserSession,
  authenticatedHeaders,
} from '../helpers/browser-session.ts';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);
/** WCAG 2.x A/AA (+2.2 AA) axe scan, as in the S18 accessibility gate. */
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
async function post(
  page: Page,
  headers: Record<string, string>,
  bodyMarkdown: string,
) {
  const response = await page.request.post('/api/notes', {
    headers,
    data: {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown,
        timelineAt: null,
        location: null,
        attachmentIds: [],
      },
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data.noteId as string;
}

test('NT-SIDEBAR/NT-UI: count-ordered nested tree, subtree filters, autocomplete and scoped removal', async ({
  page,
}) => {
  await browserSession(page);
  const headers = await authenticatedHeaders(page);
  const root = `nt${randomUUID().slice(0, 8)}`;
  // `zeta` has more notes than `alpha`, so it must come first despite the name.
  await post(page, headers, `#${root}/alpha one`);
  for (let i = 0; i < 3; i++)
    await post(page, headers, `#${root}/zeta/deep two ${i}`);
  await post(page, headers, `#${root} own`);

  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  const parent = sidebar.getByRole('link', { name: `#${root} (5)` });
  // The sidebar lists only the most used tags; other suites may have created
  // busier ones. The Tags page always reaches every tag.
  if (await parent.count()) {
    // Children stay collapsed until expanded.
    const toggle = sidebar.getByRole('button', {
      name: `Show subtags of #${root}`,
    });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(
      sidebar.getByRole('button', { name: `Hide subtags of #${root}` }),
    ).toHaveAttribute('aria-expanded', 'true');
    const children = sidebar.getByRole('link', {
      name: new RegExp(`^#${root}/`),
    });
    await expect(children).toHaveText([/^#zeta\s+\(3\)$/, /^#alpha\s+\(1\)$/]);
    // Keyboard expansion of a nested level.
    await sidebar
      .getByRole('button', { name: `Show subtags of #${root}/zeta` })
      .press('Enter');
    await expect(
      sidebar.getByRole('link', { name: `#${root}/zeta/deep (3)` }),
    ).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  }

  // Parent filter includes subtags.
  await page.goto(`/?tag=${root}`);
  await expect(page.getByTestId('posted-note')).toHaveCount(5);
  // The tag view is announced by its header, not by a filter chip.
  await expect(
    page.getByRole('region', { name: 'Active filters' }),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${root}`);
  // The active branch is revealed in the sidebar when it is listed there.
  await page.goto(`/?tag=${root}/zeta`);
  await expect(page.getByTestId('posted-note')).toHaveCount(3);
  if (await sidebar.getByRole('link', { name: `#${root} (5)` }).count())
    await expect(
      sidebar.getByRole('button', { name: `Hide subtags of #${root}` }),
    ).toHaveAttribute('aria-expanded', 'true');

  // Autocomplete lists children after a trailing slash.
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Write a note…' }).click();
  const text = composer.getByRole('textbox');
  await text.pressSequentially(`x #${root}/`);
  const suggestions = composer.getByRole('listbox', { name: 'Existing tags' });
  await expect(suggestions.getByRole('option')).toHaveText([
    `#${root}/zeta`,
    `#${root}/zeta/deep`,
    `#${root}/alpha`,
  ]);
  await text.press('Enter');
  await expect(text).toHaveValue(`x #${root}/zeta`);
  await text.fill(''); // Empty editors need no leave confirmation.

  // Management from the tag view: remove only the exact parent hashtag.
  await page.goto(`/?tag=${root}`);
  await page.getByRole('button', { name: 'Tag actions' }).click();
  await page.getByRole('menuitem', { name: 'Remove Tag' }).click();
  await expect(
    page.getByRole('radio', { name: new RegExp(`Only #${root}`) }),
  ).toBeChecked();
  await page.getByRole('button', { name: 'Preview tag changes' }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove Tag' });
  await expect(confirm).toContainText('1 notes');
  await confirm.getByRole('button', { name: 'Confirm remove' }).click();
  await expect(page).toHaveURL('/');
  await page.goto(`/?tag=${root}`);
  await expect(page.getByTestId('posted-note')).toHaveCount(4);
});
