import {
  browserSession,
  authenticatedHeaders,
} from '../helpers/browser-session.ts';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  chromium,
  expect,
  test,
  type Page,
  type BrowserContext,
} from '@playwright/test';

const origin = 'http://127.0.0.1:4173';
async function signIn(page: Page, context: BrowserContext) {
  await browserSession(page);
  // Browser request contexts do not send Secure cookies over loopback HTTP,
  // while Chromium does. The context still stores the server-issued cookie.
  expect(
    (await context.cookies()).some((c) => c.name === 'pandanote_session'),
  ).toBe(true);
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
    })),
  ).toEqual(
    expect.objectContaining({
      width: await page.evaluate(() => innerWidth),
      height: await page.evaluate(() => innerHeight),
    }),
  );
}

test('appearance persists in SQLite and SSR before JavaScript, follows system, and failures retain choices', async ({
  page,
  context,
  browser,
}) => {
  await signIn(page, context);
  await page.goto('/settings');
  await page.getByLabel('Theme', { exact: true }).selectOption('dark');
  await page.getByLabel('Density', { exact: true }).selectOption('compact');
  await page.getByLabel('Collapse long notes by default').uncheck();
  await page.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.getByRole('status')).toHaveText('Appearance saved.');
  const savedCookie = (await context.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!;
  const headers = { origin, cookie: `pandanote_session=${savedCookie.value}` };
  const html = await page.request.get('/settings', { headers });
  expect(await html.text()).toMatch(
    /<html[^>]*data-theme="dark"[^>]*data-density="compact"[^>]*data-collapse="false"/,
  );
  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    colorScheme: 'light',
  });
  try {
    await noJs.addCookies([savedCookie]);
    const staticPage = await noJs.newPage();
    await staticPage.goto('/settings');
    await expect(staticPage.locator('html')).toHaveAttribute(
      'data-theme',
      'dark',
    );
    await expect(staticPage.locator('body')).toHaveCSS(
      'background-color',
      'rgb(23, 28, 24)',
    );
  } finally {
    await noJs.close();
  }
  await expect(page).toHaveScreenshot('settings-dark-compact.png', {
    mask: [page.locator('[data-calendar-month]')],
  });
  await page.reload();
  await expect(page.getByLabel('Density', { exact: true })).toHaveValue(
    'compact',
  );
  expect(
    (
      await page.request.patch('/api/settings/appearance', {
        data: {
          theme: 'dark',
          density: 'compact',
          collapseLongNotes: false,
          sessionLifetimeDays: 1,
        },
        headers,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.patch('/api/settings/appearance', {
        data: { theme: 'dark', density: 'compact', collapseLongNotes: false },
        headers: { ...headers, origin: 'https://attacker.invalid' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch('/api/settings/appearance', {
        data: { theme: 'dark', density: 'compact', collapseLongNotes: false },
        headers: { origin, cookie: '' },
      })
    ).status(),
  ).toBe(401);
  await page.route('**/api/settings/appearance', (route) => route.abort());
  await page.getByLabel('Theme', { exact: true }).selectOption('light');
  await page.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.getByRole('alert')).toContainText('please retry');
  await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.unroute('**/api/settings/appearance');
  await page.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(250, 249, 246)',
  );
  await page.getByLabel('Theme', { exact: true }).selectOption('system');
  await page.getByLabel('Density', { exact: true }).selectOption('comfortable');
  await page.getByLabel('Collapse long notes by default').check();
  await page.getByRole('button', { name: 'Save appearance' }).click();
  await expect(page.getByRole('status')).toHaveText('Appearance saved.');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(23, 28, 24)',
  );
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(250, 249, 246)',
  );
});

test('real private shell viewport/screenshot matrix, mobile drawer focus, navigation and editor shrinking', async ({
  page,
  context,
}, testInfo) => {
  await signIn(page, context);
  // Real current-month notes make screenshot scroller height independent of other specs.
  const headers = await authenticatedHeaders(page);
  for (let n = 0; n < 34; n++) {
    const response = await page.request.post('/api/notes', {
      headers,
      data: {
        action: 'create',
        mutationId: crypto.randomUUID(),
        content: {
          bodyMarkdown: `Synthetic shell reading ${n} #000shell1 #000shell2 #000shell3 #000shell4 #000shell5 #000shell6`,
          timelineAt: Date.now() - n * 1000,
          location: null,
          attachmentIds: [],
        },
      },
    });
    expect(response.status()).toBe(200);
  }
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [768, 1024],
    [1440, 900],
    [1440, 420],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'All notes', exact: true }),
    ).toBeVisible();
    await noOverflow(page);
    if (width === 390 || (width === 1440 && height === 900))
      await expect(page).toHaveScreenshot(
        `shell-light-${width}x${height}.png`,
        {
          mask: [
            page.locator('#notes-pane .timeline-content'),
            page.locator('[data-calendar-month]'),
          ],
        },
      );
    await testInfo.attach(`shell-${width}x${height}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole('button', { name: 'Menu & search' });
  await menu.click();
  const drawer = page.getByRole('dialog', { name: 'Notebook navigation' });
  await expect(drawer).toBeVisible();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    expect(
      await drawer.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(menu).toBeFocused();
  await menu.click();
  await drawer.getByRole('link', { name: 'Trash', exact: true }).click();
  await expect(page).toHaveURL(/\/trash$/);
  await expect(drawer).not.toBeVisible();
  const compose = page.getByRole('button', { name: 'Compose a note' });
  await compose.click();
  const editor = page.getByRole('dialog', { name: 'Write a note' });
  const text = editor.getByRole('textbox', { name: 'Note text' });
  await expect(text).toBeFocused();
  await text.fill('Unsaved synthetic thought 香港');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+Enter');
  await expect(
    editor.getByRole('button', { name: 'Post', exact: true }),
  ).toBeEnabled();
  // Resize emulates a content-resizing virtual keyboard; not a real device IME.
  await page.setViewportSize({ width: 390, height: 390 });
  await expect(
    editor.getByRole('button', { name: 'Post', exact: true }),
  ).toBeInViewport();
  await expect(
    editor.getByRole('button', { name: 'Close Write a note' }),
  ).toBeInViewport();
  await noOverflow(page);
  await page.keyboard.press('Escape');
  const prompt = page.getByRole('dialog', {
    name: 'Unsaved changes',
    exact: true,
  });
  await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(text).toHaveValue(/Unsaved synthetic thought 香港/);
  await page.keyboard.press('Escape');
  await prompt.getByRole('button', { name: 'Discard', exact: true }).click();
  // Acknowledge a genuine beforeunload prompt if the final local flush is pending.
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto('/');
});

test('actual shell independently scrolls synthetic notes; many tags stay reachable and searchable on short screens', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 420 });
  await page.goto('http://127.0.0.1:4174/shell.html');
  const scroller = page.getByRole('main', { name: 'Notes pane' });
  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  const composer = page.getByTestId('composer');
  const before = {
    sidebar: await sidebar.boundingBox(),
    composer: await composer.boundingBox(),
  };
  await scroller.focus();
  // Finish Chromium's animated keyboard gesture before testing a separate jump.
  // Otherwise a pending compositor PageDown tick can run after Back to Top.
  await scroller.evaluate((el) => {
    (
      el as HTMLElement & { keyboardScrollDone?: Promise<void> }
    ).keyboardScrollDone = new Promise<void>((resolve) =>
      el.addEventListener('scrollend', () => resolve(), { once: true }),
    );
  });
  await page.keyboard.press('PageDown');
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await scroller.evaluate(
    (el) =>
      (el as HTMLElement & { keyboardScrollDone?: Promise<void> })
        .keyboardScrollDone,
  );
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await sidebar.boundingBox()).toEqual(before.sidebar);
  expect((await composer.boundingBox())!.y).toBeLessThan(before.composer!.y);
  await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.getByRole('button', { name: 'Back to Top ↑' }).click();
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await composer.boundingBox()).toEqual(before.composer);
  await expect(scroller).toBeFocused();
  await noOverflow(page);
  await sidebar.getByRole('button', { name: 'Show all tags (200)' }).click();
  const panel = page.getByRole('dialog', { name: 'All tags', exact: true });
  await expect(panel.getByLabel('Find a tag')).toBeFocused();
  await panel.getByLabel('Find a tag').fill('199');
  await expect(panel.getByRole('listitem')).toHaveCount(1);
  await expect(panel).toContainText('香港-図書館-199');
  await page.keyboard.press('Escape');
  await expect(
    sidebar.getByRole('button', { name: 'Show all tags (200)' }),
  ).toBeFocused();
  // Equivalent layout width at 200% browser zoom on a 1440px display.
  await page.setViewportSize({ width: 720, height: 450 });
  await noOverflow(page);
  await page.getByRole('button', { name: 'Menu & search' }).click();
  const drawer = page.getByRole('dialog', { name: 'Notebook navigation' });
  await expect(
    drawer.getByRole('link', { name: 'Settings', exact: true }),
  ).toBeInViewport();
  await drawer.getByRole('button', { name: 'Show all tags (200)' }).click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1440, height: 280 });
  await expect(
    sidebar.getByRole('link', { name: 'Settings', exact: true }),
  ).toBeVisible();
  await sidebar
    .getByRole('link', { name: 'Settings', exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    sidebar.getByRole('link', { name: 'Settings', exact: true }),
  ).toBeInViewport();
  await noOverflow(page);
});

test('sidebar edge supports captured dragging, bounds, keyboard resizing and mobile reflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4174/shell.html');
  const edge = page.getByRole('separator', { name: 'Resize sidebar' });
  await expect(edge).toHaveAttribute('aria-valuenow', '272');
  const bounds = (await edge.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, 200);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 100, 200);
  await expect(edge).toHaveAttribute('aria-valuenow', '372');
  await page.mouse.move(1200, 200); // pointer capture keeps resizing off the edge
  await expect(edge).toHaveAttribute('aria-valuenow', '480');
  await page.mouse.move(0, 200);
  await expect(edge).toHaveAttribute('aria-valuenow', '240');
  await page.mouse.move(1200, 200);
  await page.mouse.up();
  await expect(edge).toHaveAttribute('aria-valuenow', '480');
  await page.mouse.move(100, 200);
  await expect(edge).toHaveAttribute('aria-valuenow', '480');
  await edge.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(edge).toHaveAttribute('aria-valuenow', '460');
  await page.keyboard.press('Home');
  await expect(edge).toHaveAttribute('aria-valuenow', '240');
  await page.keyboard.press('End');
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(edge).toHaveAttribute('aria-valuenow', '420');
  await noOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(edge).not.toBeVisible();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Menu & search' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Notebook navigation' }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(edge).toHaveAttribute('aria-valuenow', '420');
  await expect(
    page.getByRole('dialog', { name: 'Notebook navigation' }),
  ).not.toBeVisible();
});

test('desktop composer expands on focus without publishing and reduced motion uses the token policy', async ({
  page,
}) => {
  await page.goto('http://127.0.0.1:4174/shell.html');
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.getByRole('button', { name: 'Write a note…' }).focus();
  await expect(page.getByRole('textbox', { name: 'Note text' })).toBeFocused();
  await page.getByRole('textbox', { name: 'Note text' }).fill('In-memory only');
  await page.getByRole('button', { name: 'Enter focus mode' }).click();
  const editor = page.getByRole('dialog', { name: 'Write a note' });
  await expect(editor.getByRole('textbox')).toHaveValue('In-memory only');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Enter focus mode' }),
  ).toBeFocused();
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue('--motion-duration')
        .trim(),
    ),
  ).toBe('0ms');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(23, 28, 24)',
  );
  const text = page.getByRole('textbox', { name: 'Note text' });
  expect(
    await text.evaluate((el) => {
      el.focus();
      return getComputedStyle(el.closest('.editor-container')!).outlineStyle;
    }),
  ).toBe('solid');
});

test('native Chromium 200% browser zoom keeps shell, drawer and editor reachable', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const root = await mkdtemp(join(tmpdir(), 'pandanote-native-zoom-'));
  let zoomContext: BrowserContext | undefined;
  try {
    // Test-only MV3 extension drives the actual browser zoom API, not CSS zoom,
    // pinch/pageScaleFactor, device scale or a merely resized CSS viewport.
    const extension = join(root, 'extension');
    await mkdir(extension);
    await writeFile(
      join(extension, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        name: 'PandaNote synthetic zoom test',
        version: '1.0',
        permissions: ['tabs'],
        background: { service_worker: 'background.js' },
      }),
    );
    await writeFile(
      join(extension, 'background.js'),
      'chrome.runtime.onInstalled.addListener(() => {});',
    );
    zoomContext = await chromium.launchPersistentContext(
      join(root, 'profile'),
      {
        channel: 'chromium',
        viewport: { width: 1440, height: 900 },
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
      },
    );
    const worker =
      zoomContext.serviceWorkers()[0] ??
      (await zoomContext.waitForEvent('serviceworker'));
    const page = await zoomContext.newPage();
    await page.goto('http://127.0.0.1:4174/shell.html');
    await worker.evaluate(
      'chrome.tabs.query({url: "http://127.0.0.1:4174/*"}).then(tabs => chrome.tabs.setZoom(tabs[0].id, 2))',
    );
    await expect
      .poll(() =>
        page.evaluate(() => ({
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
          pinchScale: visualViewport!.scale,
        })),
      )
      .toEqual({ width: 720, height: 450, dpr: 2, pinchScale: 1 });
    await noOverflow(page);
    await page.getByRole('button', { name: 'Menu & search' }).click();
    const drawer = page.getByRole('dialog', { name: 'Notebook navigation' });
    await expect(
      drawer.getByRole('link', { name: 'Settings', exact: true }),
    ).toBeInViewport();
    for (let i = 0; i < 16; i++) {
      await page.keyboard.press(i % 2 ? 'Tab' : 'Shift+Tab');
      expect(
        await drawer.evaluate((el) => el.contains(document.activeElement)),
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Compose a note' }).click();
    const editor = page.getByRole('dialog', { name: 'Write a note' });
    await editor
      .getByRole('textbox', { name: 'Note text' })
      .fill('Native 200% zoom text 香港');
    await expect(
      editor.getByRole('button', { name: 'Post', exact: true }),
    ).toBeInViewport();
    await expect(
      editor.getByRole('button', { name: 'Close Write a note' }),
    ).toBeInViewport();
    await testInfo.attach('native-200-percent-editor', {
      body: await page.screenshot({
        path: testInfo.outputPath('native-200-percent-editor.png'),
      }),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Continue writing' }),
    ).toBeFocused();
    // Remove text before disposing the isolated browser; no recovery is implied.
    await page.getByRole('button', { name: 'Continue writing' }).click();
    await editor.getByRole('textbox').fill('');
  } finally {
    await zoomContext?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('touch-only private navigation and safe-area/keyboard-shrink scenarios expose labeled controls without losing shell text', async ({
  browser,
}, testInfo) => {
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  try {
    const page = await mobile.newPage();
    await signIn(page, mobile);
    await page.goto('/');
    const cdp = await mobile.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {
      insets: { top: 24, bottom: 34, left: 12, right: 18 },
    });
    await expect(page.locator('.app-shell')).toHaveCSS('padding-top', '24px');
    await expect(page.locator('.app-shell')).toHaveCSS('padding-left', '12px');
    await expect(page.locator('.app-shell')).toHaveCSS('padding-right', '18px');
    await expect(page.getByRole('main', { name: 'Notes pane' })).toHaveCSS(
      'padding-bottom',
      '34px',
    );
    await noOverflow(page);
    for (const [label, path] of [
      ['Manage', '/tags'],
      ['Trash', '/trash'],
      ['Settings', '/settings'],
      ['All notes', '/'],
    ]) {
      await page.getByRole('button', { name: 'Menu & search' }).tap();
      const drawer = page.getByRole('dialog', { name: 'Notebook navigation' });
      await drawer.getByRole('link', { name: label, exact: true }).tap();
      await expect(page).toHaveURL(`${origin}${path}`);
      await expect(drawer).not.toBeVisible();
    }
    await page.getByRole('button', { name: 'Compose a note' }).tap();
    const editor = page.getByRole('dialog', { name: 'Write a note' });
    const text = editor.getByRole('textbox', { name: 'Note text' });
    await text.fill('Safe area and keyboard scenario 香港');
    for (const [edge, value] of [
      ['top', '24px'],
      ['bottom', '34px'],
      ['left', '12px'],
      ['right', '18px'],
    ])
      await expect(editor).toHaveCSS(`padding-${edge}`, value);
    // Review the browser accessibility representation, not just DOM text.
    const tree = await editor.ariaSnapshot();
    expect(tree).toContain('dialog "Write a note"');
    expect(tree).toContain('textbox "Note text"');
    expect(tree).toContain('button "Close Write a note"');
    expect(tree).toContain('button "Post"');
    await expect(
      editor.getByRole('button', { name: 'Post', exact: true }),
    ).toBeEnabled();
    // The shell uses interactive-widget=resizes-content. Resize its actual
    // mobile content viewport with nonzero safe areas for several keyboard sizes.
    for (const height of [390, 320, 260]) {
      await page.setViewportSize({ width: 390, height });
      await expect(
        editor.getByRole('button', { name: 'Post', exact: true }),
      ).toBeInViewport();
      await expect(
        editor.getByRole('button', { name: 'Close Write a note' }),
      ).toBeInViewport();
      for (const name of ['Post', 'Close Write a note']) {
        const bounds = await editor
          .getByRole('button', { name, exact: true })
          .evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return {
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              width: innerWidth,
              height: innerHeight,
            };
          });
        expect(bounds.top).toBeGreaterThanOrEqual(24);
        expect(bounds.bottom).toBeLessThanOrEqual(bounds.height - 34);
        expect(bounds.left).toBeGreaterThanOrEqual(12);
        expect(bounds.right).toBeLessThanOrEqual(bounds.width - 18);
      }
      const textGeometry = await text.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          contentHeight:
            el.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom),
          lineHeight: parseFloat(style.lineHeight),
        };
      });
      expect(textGeometry.contentHeight).toBeGreaterThanOrEqual(
        textGeometry.lineHeight,
      );
      await expect(text).toHaveValue('Safe area and keyboard scenario 香港');
      await noOverflow(page);
    }
    await testInfo.attach('safe-area-keyboard-shrink', {
      body: await page.screenshot({
        path: testInfo.outputPath('safe-area-keyboard-shrink.png'),
      }),
      contentType: 'image/png',
    });
    await editor.getByRole('button', { name: 'Close Write a note' }).tap();
    await page
      .getByRole('dialog', { name: 'Unsaved changes', exact: true })
      .getByRole('button', { name: 'Cancel', exact: true })
      .tap();
    await expect(text).toHaveValue('Safe area and keyboard scenario 香港');
    await text.fill('');
  } finally {
    await mobile.close();
  }
});
