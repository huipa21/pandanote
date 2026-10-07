import { expect, test } from '@playwright/test';

test('adapter-node login gate and minimal health response work', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle('Sign in · PandaNote');
  await expect(page.getByRole('heading', { name: 'PandaNote' })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  const health = await request.get('/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['cache-control']).toBe('no-store');
  expect(await health.json()).toEqual({ status: 'ok' });
  // Technical harness routes must never ship in production.
  const privateProbe = await request.get('/__spikes/mermaid', {
    maxRedirects: 0,
  });
  expect(privateProbe.status()).toBe(303);
  expect(privateProbe.headers().location).toBe('/login');
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
