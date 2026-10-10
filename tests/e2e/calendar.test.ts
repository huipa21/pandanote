import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';
let seeded = false;
async function start(page: Page) {
  const cookies = await browserSession(page);
  const headers = {
    origin: 'http://127.0.0.1:4173',
    cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
  };
  expect(
    (
      await page.request.patch('/api/settings/calendar', {
        headers,
        data: { timezone: 'UTC', weekStart: 1 },
      })
    ).status(),
  ).toBe(200);
  if (!seeded)
    seeded =
      (
        await (
          await page.request.get('/api/notes?tag=s11calendar', { headers })
        ).json()
      ).data.items.length > 0;
  if (!seeded) {
    for (let i = 0; i < 41; i++) {
      const date =
        i < 35
          ? '2025-01-31T12:00Z'
          : i < 39
            ? '2024-12-31T12:00Z'
            : i === 39
              ? '2024-02-29T12:00Z'
              : '2025-01-31T15:00Z';
      const body =
        `S11 calendar ${i} ${i === 40 ? '#S11other' : '#S11calendar'} 香港\n\n` +
        (i === 34
          ? '```mermaid\ngraph TD; A-->B\n```\n\n' +
            'Tall synthetic paragraph.\n\n'.repeat(300)
          : 'A quiet memory.\n\n'.repeat(8));
      expect(
        (
          await page.request.post('/api/notes', {
            headers,
            data: {
              action: 'create',
              mutationId: randomUUID(),
              content: {
                bodyMarkdown: body,
                timelineAt: Date.parse(date) + i,
                location: null,
                attachmentIds: [],
              },
            },
          })
        ).status(),
      ).toBe(200);
    }
    seeded = true;
  }
  await page.goto('/?tag=s11calendar&month=2025-01');
  const side = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(side.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '2025-01',
  );
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  return { side, headers };
}
async function anchor(page: Page) {
  return page.locator('#notes-pane').evaluate((scroller) => {
    const top = scroller.getBoundingClientRect().top;
    const card = [
      ...scroller.querySelectorAll<HTMLElement>('[data-note-id]'),
    ].find((n) => n.getBoundingClientRect().bottom > top + 1)!;
    return {
      id: card.dataset.noteId,
      offset: card.getBoundingClientRect().top - top,
    };
  });
}

test('month/year/day controls keep global counts, lock day pagination, retain filters on Today and preserve empty months/Back', async ({
  page,
  browser,
}, testInfo) => {
  const { side } = await start(page);
  const weekdayLabels = await side.locator('th abbr').allTextContents();
  expect(weekdayLabels).toEqual([
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ]);
  const heading = side.getByRole('button', { name: 'January 2025' });
  const previous = side.getByRole('link', {
    name: 'Previous month',
    exact: true,
  });
  const next = side.getByRole('link', { name: 'Next month', exact: true });
  expect((await heading.boundingBox())!.x).toBeLessThan(
    (await previous.boundingBox())!.x,
  );
  expect((await previous.boundingBox())!.x).toBeLessThan(
    (await next.boundingBox())!.x,
  );
  await expect(heading).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  const day = side.locator('[data-date="2025-01-31"]');
  await expect(day).toHaveAttribute('aria-label', /36 published notes/); // includes unrelated tag
  await testInfo.attach('calendar-desktop-light', {
    body: await page.screenshot({
      path: testInfo.outputPath('calendar-desktop-light.png'),
    }),
    contentType: 'image/png',
  });
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies(await page.context().cookies());
  const noJs = await context.newPage();
  await noJs.goto('/?tag=s11calendar&month=2025-01');
  await expect(
    noJs.getByRole('complementary').locator('[data-date="2025-01-31"]'),
  ).toHaveAttribute('aria-label', /36 published notes/);
  await context.close();
  await day.click();
  await expect(page).toHaveURL('/?tag=s11calendar&date=2025-01-31');
  await expect(day).toHaveClass(/selected/);
  await page
    .locator('#notes-pane')
    .evaluate((n) => (n.scrollTop = n.scrollHeight));
  await expect(page.getByTestId('posted-note')).toHaveCount(35);
  await expect(page.getByText('You’ve reached the beginning.')).toBeVisible();
  await expect(side.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '2025-01',
  );
  await page.getByRole('link', { name: 'Remove day filter' }).click();
  await expect(page).toHaveURL('/?tag=s11calendar');
  await page.goto('/?tag=s11calendar&date=2025-01-31');
  await side.locator('[data-date="2025-01-31"]').click();
  await expect(page).toHaveURL('/?tag=s11calendar');
  await page.goto('/?tag=s11calendar&month=2025-01');
  await side.getByRole('link', { name: 'Next month', exact: true }).click();
  await expect(page).toHaveURL('/?tag=s11calendar&month=2025-02');
  await expect(page.getByRole('region', { name: 'Empty month' })).toBeVisible();
  await expect(page.getByTestId('posted-note')).toHaveCount(0);
  await page.waitForTimeout(400); // must not auto-load from visible empty sentinel
  await expect(side.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '2025-02',
  );
  await page
    .getByRole('button', { name: 'Load older notes', exact: true })
    .click();
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  await side.getByRole('button', { name: 'January 2025' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose year and month' });
  await picker.getByLabel('Year', { exact: true }).fill('2024');
  await picker.getByLabel('Month', { exact: true }).selectOption('2');
  await picker.getByRole('link', { name: 'Go to month' }).click();
  await expect(page).toHaveURL('/?tag=s11calendar&month=2024-02');
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL('/?tag=s11calendar&month=2025-02');
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  const search = side.getByRole('searchbox', { name: 'Search notes' });
  await search.fill('香港');
  await expect(page).toHaveURL('/?tag=s11calendar&q=%22%E9%A6%99%E6%B8%AF%22'); // no calendar-month bound
  await side.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page).toHaveURL(/tag=s11calendar&q=.*&month=/);
  await expect(
    page.getByRole('region', { name: 'Active filters' }),
  ).toContainText('香港');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu & search' }).click();
  const drawer = page.getByRole('dialog', { name: 'Notebook navigation' });
  await drawer
    .getByRole('link', { name: 'Previous month', exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('top visible tall/Mermaid cards track year boundaries without scroll reset/flicker or history spam; stale counts cannot win', async ({
  page,
}) => {
  const { side } = await start(page);
  const current = page.getByTestId('posted-note').first();
  await current.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(current.locator('[data-diagram] svg')).toBeVisible();
  await page.locator('#notes-pane').evaluate((n) => (n.scrollTop = 400));
  await expect(side.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '2025-01',
  );
  await current.getByRole('button', { name: 'Show less', exact: true }).click();
  for (let n = 0; n < 2; n++)
    await page
      .locator('#notes-pane')
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.getByTestId('posted-note')).toHaveCount(40);
  const december = page
    .getByTestId('posted-note')
    .filter({ hasText: 'S11 calendar 38' });
  const history = await page.evaluate(() => window.history.length);
  const url = page.url();
  let seen!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => (seen = r)),
    held = new Promise<void>((r) => (release = r));
  await page.route(
    '**/api/calendar?month=2024-12',
    async (route) => {
      const response = await route.fetch();
      seen();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await december.evaluate((el) => {
    const scroller = el.closest('#notes-pane')!;
    scroller.scrollTop +=
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 2;
  });
  await entered;
  const position = await anchor(page);
  await expect(side.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '2024-12',
  );
  await page.getByRole('button', { name: 'Back to Top ↑' }).click();
  await expect
    .poll(() => page.locator('#notes-pane').evaluate((n) => n.scrollTop))
    .toBe(0);
  await expect(side.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '2025-01',
  );
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(side.locator('[data-date="2025-01-31"]')).toHaveAttribute(
    'aria-label',
    /36 published notes/,
  );
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  await december.evaluate((el) => {
    const scroller = el.closest('#notes-pane')!;
    scroller.scrollTop +=
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 2;
  });
  await expect(side.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '2024-12',
  );
  await page.waitForTimeout(300);
  expect(await anchor(page)).toEqual(position);
  await side.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL('/settings');
  await page.goBack();
  await expect(page.getByTestId('posted-note')).toHaveCount(40);
  await expect(side.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '2024-12',
  );
  await expect.poll(async () => (await anchor(page)).id).toBe(position.id);
  await expect
    .poll(async () => (await anchor(page)).offset)
    .toBeCloseTo(position.offset, 0);
});

test('scrolling composer and Back to Top retain unpublished text, filters and loaded notes', async ({
  page,
}) => {
  await start(page);
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Write a note…' }).click();
  const text = composer.getByRole('textbox', { name: 'Note text' });
  await text.fill('Unpublished scrolling draft 香港');
  await expect(page.locator('#notes-pane')).toHaveJSProperty('scrollTop', 0);
  await page
    .locator('#notes-pane')
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.getByTestId('posted-note')).toHaveCount(40);
  await expect(composer).not.toBeInViewport();
  const url = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Back to Top ↑' }).click();
  await expect(page.locator('#notes-pane')).toHaveJSProperty('scrollTop', 0);
  await expect(text).toHaveValue('Unpublished scrolling draft 香港');
  await expect(composer).toBeInViewport();
  await expect(page.getByTestId('posted-note')).toHaveCount(40);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(page.locator('#notes-pane')).toBeFocused();
  // Flush local storage before test-owned navigation; nothing was posted.
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Drafts', exact: true })
    .click();
  await expect(
    page
      .getByTestId('local-draft')
      .filter({ hasText: 'Unpublished scrolling draft 香港' }),
  ).toHaveCount(1);
});

test('timezone detection is an explicit proposal; settings errors retain choices and saved zone drives dates across browser zones', async ({
  page,
  browser,
}) => {
  const { headers } = await start(page);
  await page.goto('/settings');
  await page.getByLabel('App timezone', { exact: true }).fill('Mars/Invalid');
  await page
    .getByRole('button', { name: 'Save calendar', exact: true })
    .click();
  await expect(
    page.getByText('Enter a valid IANA timezone, such as Asia/Hong_Kong.'),
  ).toBeVisible();
  await page.getByRole('button', { name: /Use browser timezone/ }).click();
  await page.getByLabel('App timezone', { exact: true }).fill('Asia/Tokyo');
  await page.getByLabel('Week starts on', { exact: true }).selectOption('0');
  await page.route('**/api/settings/calendar', (route) => route.abort(), {
    times: 1,
  });
  await page
    .getByRole('button', { name: 'Save calendar', exact: true })
    .click();
  await expect(page.getByLabel('App timezone', { exact: true })).toHaveValue(
    'Asia/Tokyo',
  );
  await page.unrouteAll({ behavior: 'wait' });
  await page
    .getByRole('button', { name: 'Save calendar', exact: true })
    .click();
  await expect(
    page.getByText('Calendar saved. Dates and counts now use this timezone.'),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('App timezone', { exact: true })).toHaveValue(
    'Asia/Tokyo',
  );
  const context = await browser.newContext({
    timezoneId: 'America/Los_Angeles',
  });
  await context.addCookies(await page.context().cookies());
  const other = await context.newPage();
  await other.goto('/?tag=s11other&date=2025-02-01');
  await expect(other.getByTestId('posted-note')).toHaveCount(1); // 15:00Z is Feb 1 in Tokyo
  await expect(
    other.getByRole('complementary').locator('[data-date="2025-02-01"]'),
  ).toHaveAttribute('aria-label', /1 published note/);
  await context.close();
  expect(
    (
      await page.request.get('/api/calendar?month=2025-01', {
        headers: { cookie: '' },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.get('/api/calendar?month=2025-01&tag=work', {
        headers,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.patch('/api/settings/calendar', {
        headers: { ...headers, origin: 'https://attacker.invalid' },
        data: { timezone: 'UTC', weekStart: 1 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch('/api/settings/calendar', {
        headers,
        data: { timezone: 'UTC', weekStart: 1, theme: 'dark' },
      })
    ).status(),
  ).toBe(400);
  await page.getByLabel('App timezone', { exact: true }).fill('UTC');
  await page.getByLabel('Week starts on', { exact: true }).selectOption('1');
  await page
    .getByRole('button', { name: 'Save calendar', exact: true })
    .click();
  await expect(
    page.getByText('Calendar saved. Dates and counts now use this timezone.'),
  ).toBeVisible();
});

test('calendar count errors retry safely and lifecycle actions refresh all-published heat without losing selected day', async ({
  page,
}) => {
  const { side } = await start(page);
  await page.route('**/api/calendar?month=2024-12', (route) => route.abort(), {
    times: 1,
  });
  await page
    .locator('#notes-pane')
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.getByTestId('posted-note')).toHaveCount(40);
  const december = page
    .getByTestId('posted-note')
    .filter({ hasText: 'S11 calendar 38' });
  await december.evaluate((el) => {
    const scroller = el.closest('#notes-pane')!;
    scroller.scrollTop +=
      el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + 2;
  });
  await expect(
    side.getByRole('button', { name: 'Retry activity' }),
  ).toBeVisible();
  await side.getByRole('button', { name: 'Retry activity' }).click();
  await expect(side.locator('[data-date="2024-12-31"]')).toHaveAttribute(
    'aria-label',
    /4 published notes/,
  );
  await side.locator('[data-date="2024-12-31"]').click();
  await expect(page.getByTestId('posted-note')).toHaveCount(4);
  await page
    .getByTestId('posted-note')
    .first()
    .getByRole('button', { name: 'Note actions' })
    .click();
  await page
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm move', exact: true }).click();
  await expect(page.getByTestId('posted-note')).toHaveCount(3);
  await expect(side.locator('[data-date="2024-12-31"]')).toHaveAttribute(
    'aria-label',
    /3 published notes/,
  );
  await expect(side.locator('[data-date="2024-12-31"]')).toHaveClass(
    /selected/,
  );
});

test('posting from Drafts invalidates calendar counts and a delayed image preserves the top-visible month and reading anchor', async ({
  page,
}, testInfo) => {
  const { side, headers } = await start(page);
  await page.goto('/?month=2024-12');
  await expect(side.locator('[data-date="2024-12-30"]')).toHaveAttribute(
    'aria-label',
    /0 published notes/,
  );
  await side.getByRole('link', { name: 'Drafts', exact: true }).click();
  await expect(page).toHaveURL('/drafts');
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await page
    .getByRole('textbox', { name: 'Note text' })
    .fill('S11 delayed image #S11image');
  const png = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#468458' },
  })
    .png()
    .toBuffer();
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'calendar.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Add note options' })
    .click();
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Date', exact: true })
    .click();
  const input = page.getByLabel('Timeline date/time (UTC)').first();
  await input.fill('2024-12-30T12:00');
  await input.dispatchEvent('change');
  await page
    .getByRole('button', { name: 'Close Timeline date', exact: true })
    .click();
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(side.locator('[data-date="2024-12-30"]')).toHaveAttribute(
    'aria-label',
    /1 published note/,
  );
  let seen!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => (seen = r)),
    held = new Promise<void>((r) => (release = r));
  await page.route(
    '**/api/attachments/*/thumbnail',
    async (route) => {
      const response = await route.fetch();
      seen();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.goto('/?tag=s11image&month=2024-12');
  const card = page.getByTestId('posted-note').first();
  await expect(card).toContainText('S11 delayed image');
  await entered;
  const position = await anchor(page);
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect
    .poll(() =>
      card
        .locator('.markdown img')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(400);
  expect(await anchor(page)).toEqual(position);
  await expect(side.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '2024-12',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Menu & search' }).click();
  await testInfo.attach('calendar-mobile', {
    body: await page.screenshot({
      path: testInfo.outputPath('calendar-mobile.png'),
    }),
    contentType: 'image/png',
  });
  await page
    .getByRole('dialog', { name: 'Notebook navigation' })
    .getByRole('button', { name: 'Close Notebook navigation', exact: true })
    .click();
  expect(
    (
      await page.request.patch('/api/settings/calendar', {
        headers,
        data: { timezone: 'America/Los_Angeles', weekStart: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/notes', {
        headers,
        data: {
          action: 'create',
          mutationId: randomUUID(),
          content: {
            bodyMarkdown: 'S11 epoch-zero #S11epoch',
            timelineAt: 0,
            location: null,
            attachmentIds: [],
          },
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/?tag=s11epoch&date=1969-12-31');
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
  await page.getByRole('button', { name: 'Menu & search' }).click();
  const epochDrawer = page.getByRole('dialog', { name: 'Notebook navigation' });
  await expect(epochDrawer.locator('[data-calendar-month]')).toHaveAttribute(
    'data-calendar-month',
    '1969-12',
  );
  await expect(epochDrawer.locator('[data-date="1969-12-31"]')).toHaveAttribute(
    'aria-label',
    /1 published note/,
  );
  expect(
    (
      await page.request.patch('/api/settings/calendar', {
        headers,
        data: { timezone: 'UTC', weekStart: 1 },
      })
    ).status(),
  ).toBe(200);
});
