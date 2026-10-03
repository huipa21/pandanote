import { expect, test } from '@playwright/test';

test('adapter-node shell and minimal health response work', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('PandaNote');
  await expect(page.getByRole('heading', { name: 'PandaNote' })).toBeVisible();
  await expect(
    page.getByText('Note-taking features are not implemented yet.', {
      exact: false,
    }),
  ).toBeVisible();
  const health = await request.get('/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['cache-control']).toBe('no-store');
  expect(await health.json()).toEqual({ status: 'ok' });
  // Technical harness routes must never ship in production.
  expect((await request.get('/__spikes/mermaid')).status()).toBe(404);
});

test('smoke shell has no horizontal overflow on a small viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
