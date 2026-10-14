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
        attachmentIds: [],
      },
    },
  });
  expect(response.status()).toBe(200);
}

test('Tags page: flat lazy list, Enter search, single-tag view with rename/merge', async ({
  page,
}) => {
  await browserSession(page);
  const headers = await authenticatedHeaders(page);
  const root = `tp${randomUUID().slice(0, 8)}`;
  const lazy = `lz${randomUUID().slice(0, 8)}`;
  await post(page, headers, `#${root}a one`);
  await post(page, headers, `#${root}b two`);
  // A note holds at most 100 tags, so spread 130 across two notes.
  for (const range of [
    [0, 65],
    [65, 130],
  ])
    await post(
      page,
      headers,
      Array.from({ length: 65 }, (_, i) => `#${lazy}${range[0] + i}`).join(' '),
    );

  // The sidebar heading replaces the old Manage link.
  await page.goto('/');
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar.getByRole('link', { name: 'Manage' })).toHaveCount(0);
  await sidebar.getByRole('link', { name: 'Tags', exact: true }).click();
  await expect(page).toHaveURL('/tags');
  const main = page.getByRole('main', { name: 'Notes pane' });
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Tags');

  // One slim search field: no placeholder; the last control opens the syntax help.
  const search = main.getByRole('searchbox', { name: 'Search tags' });
  await expect(search).toBeEnabled();
  expect(await search.getAttribute('placeholder')).toBeNull();
  const help = main.getByRole('button', { name: 'Search syntax help' });
  await expect(help).toHaveAttribute('aria-expanded', 'false');
  await help.click();
  await expect(main.getByText('tag:name', { exact: false })).toBeVisible();
  await help.click();
  await expect(main.getByRole('button', { name: /search/i })).toHaveCount(1);

  expect(await axeViolations(page)).toEqual([]);

  // Lazy loading: 60 first, the rest after scrolling.
  await search.fill(lazy);
  await search.press('Enter');
  await expect(page).toHaveURL(`/tags?q=${lazy}`);
  const lazyLinks = main.getByRole('link', { name: new RegExp(`^#${lazy}`) });
  // Pages arrive on demand, 60 at a time, as the list nears the viewport end.
  const first = await page.request.get(`/api/tags?q=${lazy}&limit=60`, {
    headers,
  });
  expect((await first.json()).data).toMatchObject({ nextOffset: 60 });
  await expect(lazyLinks.first()).toBeVisible();
  await expect
    .poll(async () => {
      await main.evaluate((el) => (el.scrollTop = el.scrollHeight));
      return lazyLinks.count();
    })
    .toBe(130);

  // Flat list of every matching tag.
  await search.fill(root);
  await search.press('Enter');
  const paths = main.getByRole('link', { name: new RegExp(`^#${root}`) });
  await expect(paths).toHaveText([
    new RegExp(`^#${root}a\\s*1$`),
    new RegExp(`^#${root}b\\s*1$`),
  ]);
  // The same AND/OR/NOT/parentheses/tag: grammar searches tag names.
  await search.fill(`${root} NOT ${root}b`);
  await search.press('Enter');
  await expect(paths).toHaveText([new RegExp(`^#${root}a\\s*1$`)]);
  await search.fill(`tag:${root}b OR (${root}a NOT ${root}a)`);
  await search.press('Enter');
  await expect(paths).toHaveText([new RegExp(`^#${root}b\\s*1$`)]);
  await search.fill('(a');
  await search.press('Enter');
  await expect(main.getByRole('alert')).toContainText('Close every (');
  await search.fill(root);
  await search.press('Enter');
  await expect(paths).toHaveCount(2);
  await paths.first().click();
  await expect(page).toHaveURL(`/?tag=${root}a`);

  // The tag view shows the summary and a three-dot menu.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${root}a`);
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  await expect(page.getByText('1 note', { exact: true })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Tag actions' }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Rename Tag' }),
  ).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Merge Tag' })).toBeVisible();
  await expect(
    page.getByRole('menuitem', { name: 'Remove Tag' }),
  ).toBeVisible();

  // Rename rewrites the hashtag in every affected note.
  await page.getByRole('menuitem', { name: 'Rename Tag' }).click();
  const form = page.getByRole('dialog', { name: 'Rename Tag' });
  await expect(form.getByLabel('Tag name')).toHaveValue(`${root}a`);
  await form.getByLabel('Tag name').fill(`${root}c`);
  await form.getByRole('button', { name: 'Preview tag changes' }).click();
  await form.getByRole('button', { name: 'Confirm rename' }).click();
  await expect(page).toHaveURL(`/?tag=${root}c`);
  await expect(page.getByTestId('posted-note')).toContainText(`#${root}c`);

  // Merge the renamed tag into an existing tag.
  await page.getByRole('button', { name: 'Tag actions' }).click();
  await page.getByRole('menuitem', { name: 'Merge Tag' }).click();
  const merge = page.getByRole('dialog', { name: 'Merge Tag' });
  await merge.getByLabel('Merge into').fill(`${root}b`);
  await merge.getByRole('button', { name: 'Preview tag changes' }).click();
  await merge.getByRole('button', { name: 'Confirm merge' }).click();
  await expect(page).toHaveURL(`/?tag=${root}b`);
  await expect(page.getByTestId('posted-note')).toHaveCount(2);
});

test('a tag view has no redundant filter chip, leaves with search kept, and refuses several tags', async ({
  page,
}) => {
  await browserSession(page);
  const headers = await authenticatedHeaders(page);
  const tag = `sv${randomUUID().slice(0, 8)}`;
  const other = `sw${randomUUID().slice(0, 8)}`;
  await post(page, headers, `findme #${tag}`);
  await post(page, headers, `findme #${other}`);
  await post(page, headers, `plain #${tag}`);

  await page.goto(`/?tag=${tag}`);
  await expect(page.getByTestId('posted-note')).toHaveCount(2);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`#${tag}`);
  // The header names the tag; no chip or filter strip repeats it.
  await expect(
    page.getByRole('region', { name: 'Active filters' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /Remove tag filter/ }),
  ).toHaveCount(0);

  // With a search the strip shows only the search chip, and "All notes" drops
  // just the tag.
  await page.goto(`/?tag=${tag}&q=findme`);
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  const strip = page.getByRole('region', { name: 'Active filters' });
  await expect(strip).toContainText('findme');
  await expect(strip).not.toContainText(`#${tag}`);
  await page.getByRole('link', { name: 'All notes', exact: true }).click();
  await expect(page).toHaveURL(/\/\?q=.*findme/);
  await expect(page).not.toHaveURL(/tag=/);
  await expect(page.getByTestId('posted-note')).toHaveCount(2);

  // Several tags are refused instead of silently meaning "all of them".
  await page.goto(`/?tag=${tag}&tag=${other}`);
  await expect(page.getByRole('alert')).toContainText('Select only one tag.');
  await expect(page.getByTestId('posted-note')).toHaveCount(0);
  const api = await page.request.get(`/api/notes?tag=${tag}&tag=${other}`, {
    headers,
  });
  expect(api.status()).toBe(400);
});

test('tags are flat: a slash ends the hashtag instead of nesting', async ({
  page,
}) => {
  await browserSession(page);
  const headers = await authenticatedHeaders(page);
  const tag = `fl${randomUUID().slice(0, 8)}`;
  await post(page, headers, `#${tag}/sub text`);
  const response = await page.request.get(`/api/tags?q=${tag}`, { headers });
  const { items } = (await response.json()).data as {
    items: { key: string; published: number }[];
  };
  expect(items.map((t) => [t.key, t.published])).toEqual([[tag, 1]]);
});
