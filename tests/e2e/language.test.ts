import { openSettingsTab } from './settings-tab.ts';
import { expect, test, type Page } from '@playwright/test';
import { scanSetup } from '../helpers/setup-accessibility.ts';
import { browserSession } from '../helpers/browser-session.ts';

// LANG-01/02/04: language registry pickers, complete Simplified Chinese, saved site
// title in the tab/sidebar/mobile header/sign-in page. The shared fixture is always
// restored to English / "PandaNote" so later specs are unaffected.
const origin = 'http://127.0.0.1:4173';

async function restore(page: Page, cookie: string) {
  const response = await page.request.patch('/api/settings/general', {
    headers: { origin, cookie },
    data: { language: 'en', siteTitle: 'PandaNote' },
  });
  expect(response.status()).toBe(200);
}

test('language and site title: registry picker, zh-CN screens with English fallback, title in tab/header/sign-in, text-only escaping', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const cookies = await browserSession(page);
  const session = cookies.find((c) => c.name === 'pandanote_session')!;
  const cookie = `${session.name}=${session.value}`;
  try {
    await page.goto('/settings');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Settings · PandaNote');
    const select = page.locator('#general-language');
    await expect(select.locator('option')).toHaveText(['English', '简体中文']);
    await expect(select.locator('option')).toHaveCount(2);
    await expect(page.getByText('Translation in progress')).toHaveCount(0);

    // Immediate language save; complete translation (no partial notice).
    await select.selectOption('zh-CN');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(
      page.getByRole('heading', { name: '常规', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('常规设置已保存。')).toBeVisible();
    await expect(page.getByText('翻译进行中')).toHaveCount(0);
    await expect(page).toHaveTitle('设置 · PandaNote');
    const side = page.getByRole('complementary', { name: '侧边栏' });
    for (const name of ['标签', '回收站', '设置'])
      await expect(side.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(side.getByLabel('搜索笔记')).toBeVisible();
    await openSettingsTab(page, '账号');
    await expect(
      page.getByRole('heading', { name: '账号', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('账号用户名')).toBeVisible();
    // Not translated in this change: falls back to English per string.
    await openSettingsTab(page, '外观');
    await expect(
      page.getByRole('heading', { name: '外观', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(select).toHaveValue('zh-CN');
    await scanSetup(page);

    // Site title: tab, sidebar, mobile header; plain text, not markup.
    await openSettingsTab(page, '常规');
    const hostile = '<img src=x onerror="window.__title=1"> & "q"';
    const title = page.locator('#general-title');
    await title.fill('   ');
    await page.getByRole('button', { name: '保存站点标题' }).click();
    await expect(page.locator('#general-title-error')).not.toBeEmpty();
    await title.fill(hostile);
    await page.getByRole('button', { name: '保存站点标题' }).click();
    await expect(page.getByText('常规设置已保存。')).toBeVisible();
    await expect(page).toHaveTitle(`设置 · ${hostile}`);
    await expect(side.locator('.site-title')).toHaveText(hostile);
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    await page.reload();
    expect(await page.evaluate(() => '__title' in window)).toBe(false);
    await expect(page).toHaveTitle(`设置 · ${hostile}`);

    // A long title ellipsizes without breaking either shell; full text stays in DOM.
    const long = `长${'标题'.repeat(29)}末`;
    expect([...long]).toHaveLength(60);
    await title.fill(long);
    await page.getByRole('button', { name: '保存站点标题' }).click();
    await expect(page.getByText('常规设置已保存。')).toBeVisible();
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const brand =
        width < 900
          ? page.locator('.mobile-header .site-title')
          : side.locator('.site-title');
      await expect(brand).toHaveText(long);
      const box = await brand.evaluate((el) => ({
        clipped: el.scrollWidth > el.clientWidth,
        ellipsis: getComputedStyle(el).textOverflow,
        page: document.documentElement.scrollWidth <= innerWidth,
      }));
      expect(box.ellipsis).toBe('ellipsis');
      expect(box.page).toBe(true);
      if (width < 900)
        await expect(
          page.getByRole('link', { name: `${long} 首页` }),
        ).toBeVisible();
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    // Public sign-in page shows the saved title and language to a signed-out visitor
    // whatever their browser language is.
    const visitor = await browser.newContext({
      baseURL: origin,
      locale: 'en-US',
    });
    try {
      const anonymous = await visitor.newPage();
      await anonymous.goto('/login');
      await expect(anonymous.locator('html')).toHaveAttribute('lang', 'zh-CN');
      await expect(anonymous.getByRole('heading', { level: 1 })).toHaveText(
        long,
      );
      await expect(
        anonymous.getByRole('heading', { name: '登录', level: 2 }),
      ).toBeVisible();
      await expect(anonymous.getByLabel('用户名')).toBeVisible();
      await expect(anonymous).toHaveTitle(`登录 · ${long}`);
      await scanSetup(anonymous);
      const failure = await anonymous.request.post('/api/auth/login', {
        headers: { origin },
        data: { username: 'nobody', password: 'wrong-password' },
      });
      expect(failure.status()).toBe(401);
      // API errors carry a stable catalog key next to the English text.
      const denied = await anonymous.request.get('/api/notes', {
        headers: { origin },
      });
      expect(denied.status()).toBe(401);
      expect((await denied.json()).error).toMatchObject({
        code: 'unauthorized',
        message: 'Sign in to continue.',
        messageKey: 'err.signInToContinue',
      });
      await anonymous.getByLabel('用户名').fill('nobody');
      await anonymous
        .getByLabel('密码', { exact: true })
        .fill('wrong-password');
      await anonymous
        .getByRole('button', { name: '登录', exact: true })
        .click();
      await expect(anonymous.getByRole('alert')).toHaveText(
        '用户名或密码无效。',
      );
    } finally {
      await visitor.close();
    }

    // Mobile drawer uses the same translated identity.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.getByRole('button', { name: '菜单与搜索' }).click();
    const drawer = page.getByRole('dialog', { name: '笔记本导航' });
    await expect(
      drawer.getByRole('link', { name: '设置', exact: true }),
    ).toBeVisible();
    await expect(drawer.locator('.site-title')).toHaveText(long);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 800 });

    // Back to English: server-rendered with the saved value on a fresh load.
    await page.locator('#general-language').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('General settings saved.')).toBeVisible();
    await page.reload();
    await expect(page.locator('#general-language')).toHaveValue('en');
    await expect(
      page.getByRole('heading', { name: 'General', exact: true }),
    ).toBeVisible();
    await scanSetup(page);
  } finally {
    await restore(page, cookie);
  }
});
