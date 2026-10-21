import { expect, test } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';
import { buildInfoFromEnvironment } from '../../src/lib/shared/build-info.ts';
import { openSettingsTab } from './settings-tab.ts';

const expected = buildInfoFromEnvironment(process.env);
test('embedded version agrees in desktop sidebar, mobile drawer and no-JavaScript About', async ({
  page,
  browser,
}, testInfo) => {
  const cookies = await browserSession(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/settings');
  await openSettingsTab(page, 'About');
  await expect(page.locator('.desktop-sidebar [data-app-version]')).toHaveText(
    `Version ${expected.version}`,
  );
  await expect(page.locator('[data-about-version]')).toHaveText(
    expected.version,
  );
  if (expected.kind === 'release') {
    await expect(page.locator('[data-about-commit]')).toHaveText(
      expected.commit,
    );
    await expect(
      page.locator('time').filter({ hasText: expected.committedAt }),
    ).toHaveAttribute('datetime', expected.committedAt);
  } else
    await expect(page.locator('#about')).toContainText(
      'Local development / non-release build',
    );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(
    page.getByRole('dialog').locator('[data-app-version]'),
  ).toHaveText(`Version ${expected.version}`);
  await page.keyboard.press('Escape');
  await page.locator('#about').scrollIntoViewIfNeeded();
  await page
    .locator('#about')
    .screenshot({ path: testInfo.outputPath('about-mobile.png') });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 360, height: 800 },
  });
  try {
    await context.addCookies(cookies);
    const staticPage = await context.newPage();
    await staticPage.goto('/settings');
    await expect(staticPage.locator('[data-about-version]')).toHaveText(
      expected.version,
    );
    if (expected.kind === 'release')
      await expect(staticPage.locator('[data-about-commit]')).toHaveText(
        expected.commit,
      );
  } finally {
    await context.close();
  }
});
