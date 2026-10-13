import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';

let seeded = false;
async function start(page: Page) {
  const cookies = await browserSession(page);
  const headers = {
    origin: 'http://127.0.0.1:4173',
    cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
  };
  if (!seeded) {
    for (let n = 0; n < 46; n++) {
      const response = await page.request.post('/api/notes', {
        headers,
        data: {
          action: 'create',
          mutationId: randomUUID(),
          content: {
            bodyMarkdown:
              `S10 synthetic ${n} #S10search ${n % 2 ? '#S10even' : ''}\n\n` +
              (n === 0
                ? 'latestNeedle <script>globalThis.searchAttack=1</script> ＣＡＦＥ́'
                : `香港 猫 図書館 数据库 coffee ${n === 1 ? 'shop' : 'at a new shop'}`) +
              '\n\n' +
              'Private synthetic paragraph. '.repeat(20),
            timelineAt: 1_600_000_000_000 + n,
            attachmentIds: [],
          },
        },
      });
      expect(response.status()).toBe(200);
    }
    seeded = true;
  }
  await page.goto('/?tag=s10search');
  const search = page
    .getByRole('complementary', { name: 'Sidebar' })
    .getByRole('searchbox', { name: 'Search notes' });
  await expect(search).toBeEnabled();
  return { search, headers };
}

test('literal multilingual search shares SSR/cursor cards, debounces terms, highlights safe normalized excerpts and exposes clear/malformed states', async ({
  page,
  browser,
}, testInfo) => {
  const { search, headers } = await start(page);
  await search.fill('図書館');
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  await expect(
    page.getByTestId('posted-note').first().locator('mark').first(),
  ).toHaveText('図書館');
  await testInfo.attach('search-desktop', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  const initial = await page.request.get('/api/notes?tag=s10search&q=図書館', {
    headers,
  });
  const data = (await initial.json()).data;
  expect(data.anchor).toBeNull();
  expect(data.items).toHaveLength(30);
  expect(data.nextCursor).not.toBeNull();
  const second = await page.request.get(
    `/api/notes?tag=s10search&q=図書館&cursor=${data.nextCursor}`,
    { headers },
  );
  const older = (await second.json()).data;
  expect(
    new Set([...data.items, ...older.items].map((n: { id: string }) => n.id))
      .size,
  ).toBe(45);
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies(await page.context().cookies());
  const ssr = await context.newPage();
  await ssr.goto('/?tag=s10search&q=図書館');
  await expect(ssr.getByTestId('posted-note')).toHaveCount(30);
  await expect(ssr.locator('mark').first()).toHaveText('図書館');
  await context.close();
  await search.fill('"coffee shop"');
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  await search.fill('coffee shop');
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  await search.fill('資料庫');
  await expect(
    page.getByRole('heading', { name: 'No matching notes' }),
  ).toBeVisible();
  await search.fill('猫');
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  await search.fill('香港');
  await expect(
    page.getByTestId('posted-note').first().locator('mark').first(),
  ).toHaveText('香港');
  await search.fill('"<script>" café');
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  await expect(page.locator('.search-snippets mark').first()).toHaveText(
    '<script>',
  );
  expect(
    await page.evaluate(() => Reflect.get(globalThis, 'searchAttack')),
  ).toBeUndefined();
  expect(await page.locator('.search-snippets script').count()).toBe(0);
  const url = page.url();
  await search.fill('"unclosed');
  await expect(search).toHaveAttribute('aria-invalid', 'true');
  await expect(
    page.getByText('Close the double quote to search an exact phrase.').first(),
  ).toBeVisible();
  await page.waitForTimeout(450);
  expect(page.url()).toBe(url);
  await page.getByRole('link', { name: 'Remove search filter' }).click();
  await expect(page).toHaveURL('/?tag=s10search');
  await expect(search).toHaveValue('');
  await search.fill('圖書館');
  await expect(
    page.getByRole('heading', { name: 'No matching notes' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Clear all', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/?q=%22unclosed');
  await expect(page.getByRole('alert').first()).toContainText(
    'Close the double quote',
  );
});

test('superseded search/paging responses cannot replace newer results; AND tags, Back and mobile search keep context', async ({
  page,
}) => {
  const { search } = await start(page);
  await search.fill('香港');
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  let seen!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => (seen = r)),
    held = new Promise<void>((r) => (release = r));
  await page.route(
    '**/api/notes?*',
    async (route) => {
      const response = await route.fetch();
      seen();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page
    .locator('#notes-pane')
    .evaluate((n) => (n.scrollTop = n.scrollHeight));
  await entered;
  await search.fill('latestNeedle');
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByTestId('posted-note').first()).toContainText(
    'latestNeedle',
  );
  await page
    .getByTestId('posted-note')
    .first()
    .getByRole('link', { name: '#s10search', exact: true })
    .click();
  await expect(page).toHaveURL('/?tag=s10search&q=%22latestneedle%22'); // card tag opens its tag view and retains search
  await page
    .getByRole('link', { name: 'Settings', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL('/settings');
  await page.goBack();
  await expect(page).toHaveURL('/?tag=s10search&q=%22latestneedle%22');
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu & search' }).click();
  const dialog = page.getByRole('dialog', { name: 'Notebook navigation' });
  await dialog.getByRole('searchbox', { name: 'Search notes' }).fill('数据库');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  await page.getByRole('button', { name: 'Menu & search' }).click();
  const navigation = page.getByRole('dialog', { name: 'Notebook navigation' });
  // A tag click selects that single tag; the search stays.
  await navigation
    .getByRole('link', { name: '#S10even', exact: false })
    .click();
  await expect(page.getByTestId('posted-note')).toHaveCount(23);
  await expect(
    page.getByRole('region', { name: 'Active filters' }),
  ).toContainText('数据库');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
