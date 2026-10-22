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
  await expect(page.locator('.desktop-sidebar [data-app-version]')).toHaveCount(
    0,
  );
  const desktopPandanoteLink = page
    .locator('.desktop-sidebar')
    .locator('.attribution a');
  await expect(desktopPandanoteLink).toHaveAttribute(
    'href',
    'https://github.com/huipa21/pandanote',
  );
  await expect(desktopPandanoteLink).toHaveAttribute('target', '_blank');
  await expect(page.locator('.desktop-sidebar .attribution')).toHaveText(
    'Powered by Pandanote',
  );
  await page
    .locator('.desktop-sidebar')
    .getByRole('button', { name: 'Switch language to 简体中文' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.desktop-sidebar .attribution')).toHaveText(
    'Powered by Pandanote',
  );
  await page
    .locator('.desktop-sidebar')
    .getByRole('button', { name: '切换语言为English' })
    .click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
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
  ).toHaveCount(0);
  await expect(
    page.getByRole('dialog').locator('.attribution a'),
  ).toHaveAttribute('href', 'https://github.com/huipa21/pandanote');
  await expect(page.getByRole('dialog').locator('.attribution')).toHaveText(
    'Powered by Pandanote',
  );
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
