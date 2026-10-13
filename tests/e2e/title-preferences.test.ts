import { expect, test } from '@playwright/test';
import { authenticatedHeaders } from '../helpers/browser-session.ts';

// Real session, SQLite-backed partial settings writes, no preference mocks.
test('General has three densities; title toggles persist and never overwrite unsaved General fields', async ({
  page,
  browser,
}) => {
  const headers = await authenticatedHeaders(page);
  try {
    expect(
      (
        await page.request.patch('/api/settings/general', {
          headers,
          data: {
            language: 'en',
            siteTitle: 'PandaNote',
            tagline: '',
            density: 'comfortable',
            collapseLongNotes: true,
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.patch('/api/settings/appearance', {
          headers,
          data: { theme: 'system' },
        })
      ).status(),
    ).toBe(200);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/settings');
    const side = page.getByRole('complementary');
    const density = page.locator('#general-density');
    await expect(
      page.getByRole('tab', { name: 'Appearance', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('#general-language, #theme')).toHaveCount(0);
    await expect(density.locator('option')).toHaveText([
      'Compact',
      'Comfortable',
      'Spacious',
    ]);
    await expect(density).toHaveValue('comfortable');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(
      side.getByRole('button', { name: 'Switch to light mode' }),
    ).toBeEnabled();
    await expect(page.locator('body')).toHaveCSS(
      'background-color',
      'rgb(23, 28, 24)',
    );

    await page.locator('#general-title').fill('Unsaved title');
    await page.locator('#general-tagline').fill('Unsaved tagline');
    await density.selectOption('spacious');
    await side.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await side
      .getByRole('button', { name: 'Switch language to 简体中文' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(
      side.getByRole('button', { name: '切换语言为English' }),
    ).toBeEnabled();
    await expect(page.locator('#general-title')).toHaveValue('Unsaved title');
    await expect(page.locator('#general-tagline')).toHaveValue(
      'Unsaved tagline',
    );
    await expect(density).toHaveValue('spacious');
    // Density has not been saved just because the title controls were used.
    await expect(page.locator('html')).toHaveAttribute(
      'data-density',
      'comfortable',
    );
    await page.getByRole('button', { name: '保存常规设置' }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-density',
      'spacious',
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(side.locator('.site-title')).toHaveText('Unsaved title');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute(
      'data-density',
      'spacious',
    );
    await expect(page.locator('#general-density')).toHaveValue('spacious');
    const staticContext = await browser.newContext({
      javaScriptEnabled: false,
    });
    try {
      await staticContext.addCookies(await page.context().cookies());
      const staticPage = await staticContext.newPage();
      await staticPage.goto('/settings');
      await expect(staticPage.locator('html')).toHaveAttribute(
        'data-density',
        'spacious',
      );
      await expect(staticPage.locator('html')).toHaveAttribute(
        'data-theme',
        'light',
      );
      await expect(staticPage.locator('html')).toHaveAttribute('lang', 'zh-CN');
    } finally {
      await staticContext.close();
    }
    await side.getByRole('button', { name: '切换语言为English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    const padding: number[] = [];
    for (const level of ['compact', 'comfortable', 'spacious']) {
      await page.locator('#general-density').selectOption(level);
      await page.getByRole('button', { name: 'Save general settings' }).click();
      await expect(page.getByRole('status')).toHaveText(
        'General settings saved.',
      );
      await expect(page.locator('html')).toHaveAttribute('data-density', level);
      padding.push(
        await page
          .locator('html')
          .evaluate((el) =>
            parseFloat(getComputedStyle(el).getPropertyValue('--card-padding')),
          ),
      );
    }
    expect(padding[0]).toBeLessThan(padding[1]);
    expect(padding[1]).toBeLessThan(padding[2]);

    // General errors retain a staged density/title; a retry confirms the choice.
    await page.locator('#general-density').selectOption('compact');
    await page.route('**/api/settings/general', (route) => route.abort());
    await page.getByRole('button', { name: 'Save general settings' }).click();
    await expect(
      page.locator('#settings-panel-general').getByRole('alert'),
    ).toContainText('please retry');
    await expect(page.locator('#general-density')).toHaveValue('compact');
    await expect(page.locator('html')).toHaveAttribute(
      'data-density',
      'spacious',
    );
    await page.unroute('**/api/settings/general');
    await page.getByRole('button', { name: 'Save general settings' }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-density',
      'compact',
    );

    // Compact title row: icons are to the right, and every control remains reachable.
    for (const width of [360, 390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const row =
        width < 900
          ? page.locator('.mobile-header')
          : side.locator('.identity-row');
      const title = await row.locator('.site-title').boundingBox();
      const theme = await row
        .getByRole('button', { name: 'Switch to dark mode' })
        .boundingBox();
      expect(title).not.toBeNull();
      expect(theme).not.toBeNull();
      expect(theme!.x).toBeGreaterThanOrEqual(title!.x + title!.width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width !== 360)
        await test.info().attach(`title-controls-${width}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
    }
    await page.setViewportSize({ width: 390, height: 800 });
    const mobile = page.locator('.mobile-header');
    await mobile.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await mobile
      .getByRole('button', { name: 'Switch language to 简体中文' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.getByRole('button', { name: '菜单与搜索' }).click();
    const drawer = page.getByRole('dialog', { name: '笔记本导航' });
    await expect(
      drawer.getByRole('button', { name: '切换到浅色模式' }),
    ).toBeEnabled();
    await drawer.getByRole('button', { name: '切换语言为English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.keyboard.press('Escape');

    await page.route('**/api/settings/general', (route) => route.abort());
    await mobile
      .getByRole('button', { name: 'Switch language to 简体中文' })
      .click();
    await expect(mobile.getByRole('alert')).toContainText('Please retry');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      mobile.getByRole('button', { name: 'Switch language to 简体中文' }),
    ).toBeEnabled();
    await page.unroute('**/api/settings/general');
    await mobile
      .getByRole('button', { name: 'Switch language to 简体中文' })
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
    await page.request.patch('/api/settings/general', {
      headers,
      data: {
        language: 'en',
        siteTitle: 'PandaNote',
        tagline: '',
        density: 'comfortable',
        collapseLongNotes: true,
      },
    });
    await page.request.patch('/api/settings/appearance', {
      headers,
      data: { theme: 'system' },
    });
  }
});
