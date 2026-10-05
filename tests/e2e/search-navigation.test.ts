import { expect, test } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';

test('typing newer/invalid input supersedes held search navigation responses and composition waits for completion', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const search = page
    .getByRole('complementary', { name: 'Sidebar' })
    .getByRole('searchbox', { name: 'Search notes' });
  await expect(search).toBeEnabled();
  let seen!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => (seen = r)),
    held = new Promise<void>((r) => (release = r));
  await page.route(
    (url) =>
      url.pathname.endsWith('/__data.json') &&
      url.searchParams.get('q') === '"oldersearch"',
    async (route) => {
      const response = await route.fetch();
      seen();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await search.fill('oldersearch');
  await entered;
  await search.fill('"invalid');
  await expect(search).toHaveAttribute('aria-invalid', 'true');
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page).toHaveURL('/');
  await expect(search).toHaveValue('"invalid');
  await expect(search).toHaveAttribute('aria-invalid', 'true');
  await search.dispatchEvent('compositionstart');
  await search.fill('図書館');
  await page.waitForTimeout(450);
  await expect(page).toHaveURL('/');
  await search.dispatchEvent('compositionend');
  await expect(page).toHaveURL(/q=/);
  await search.fill('willnotnavigate');
  await page
    .getByRole('link', { name: 'Settings', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL('/settings');
  await page.waitForTimeout(450);
  await expect(page).toHaveURL('/settings');
});
