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
  await expect(heading).toHaveCSS('font-weight', '700');
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
  await picker
    .getByRole('button', { name: 'Previous year', exact: true })
    .click();
  await picker
    .getByRole('link', { name: 'February 2024', exact: true })
    .click();
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

test('heatmap date tiles and 4-by-3 month picker support quick years, bounds, keyboard focus and mobile selection', async ({
  page,
}, testInfo) => {
  const { side, headers } = await start(page);
  for (const [day, count] of [
    [28, 1],
    [29, 2],
    [30, 4],
  ]) {
    for (let i = 0; i < count; i++)
      expect(
        (
          await page.request.post('/api/notes', {
            headers,
            data: {
              action: 'create',
              mutationId: randomUUID(),
              content: {
                bodyMarkdown: `Heat tile ${day}/${i} #S11heat`,
                timelineAt: Date.parse(`2025-01-${day}T12:00Z`) + i,
                location: null,
                attachmentIds: [],
              },
            },
          })
        ).status(),
      ).toBe(200);
  }
  await page.goto(
    '/?tag=s11calendar&q=%22%E9%A6%99%E6%B8%AF%22&date=2025-01-31',
  );
  const url = page.url();
  const heading = side.getByRole('button', { name: 'January 2025' });
  const picker = page.getByRole('dialog', { name: 'Choose year and month' });
  const colors = new Set<string>();
  for (const [day, level] of [
    [27, 0],
    [28, 1],
    [29, 2],
    [30, 3],
    [31, 4],
  ]) {
    const date = side.locator(`[data-date="2025-01-${day}"]`);
    await expect(date).toHaveAttribute('data-level', String(level));
    await expect(date).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const tile = date.locator('.date-number');
    await expect(tile).toHaveCSS('width', '26px');
    const color = await tile.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    colors.add(color);
  }
  expect(colors.size).toBe(5);
  await expect(side.locator('[data-date="2025-01-31"]')).toHaveClass(
    /selected/,
  );
  await expect(picker).toHaveCount(0);
  await heading.click();
  await expect(picker).toBeVisible();
  await expect(picker.getByRole('link')).toHaveCount(12);
  await expect(picker.locator('.mini-heatmap')).toHaveCount(0);
  const calendarBox = (await side
    .locator('[data-calendar-month]')
    .boundingBox())!;
  const pickerBox = (await picker.boundingBox())!;
  expect(Math.abs(pickerBox.x - calendarBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(pickerBox.y - calendarBox.y)).toBeLessThanOrEqual(1);
  const boxes = await picker.getByRole('link').evaluateAll((links) =>
    links.map((link) => {
      const r = link.getBoundingClientRect();
      return { x: r.x, y: r.y };
    }),
  );
  expect(new Set(boxes.map((box) => box.x)).size).toBe(4);
  expect(new Set(boxes.map((box) => box.y)).size).toBe(3);
  await expect(
    picker.getByRole('link', { name: 'January 2025' }),
  ).toHaveAttribute('aria-current', 'date');
  await expect(picker.getByRole('link', { name: 'January 2025' })).toHaveText(
    'Jan',
  );
  await picker.getByRole('button', { name: 'Next year', exact: true }).click();
  await expect(
    picker.getByRole('link', { name: 'January 2026' }),
  ).toBeVisible();
  expect(page.url()).toBe(url); // Browsing the picker does not filter or load notes.
  await picker
    .getByRole('button', { name: 'Previous year', exact: true })
    .click();
  await testInfo.attach('month-picker-desktop', {
    body: await page.screenshot({
      path: testInfo.outputPath('month-picker-desktop.png'),
    }),
    contentType: 'image/png',
  });
  // Clicking the year enters a year manually; invalid values are rejected.
  await picker.getByRole('button', { name: 'Enter year, 2025' }).click();
  const yearInput = picker.getByRole('textbox', { name: 'Year' });
  await expect(yearInput).toBeFocused();
  await yearInput.fill('1968');
  await yearInput.press('Enter');
  await expect(picker.getByRole('alert')).toContainText('1969');
  await yearInput.fill('2031');
  await yearInput.press('Enter');
  await expect(
    picker.getByRole('button', { name: 'Enter year, 2031' }),
  ).toBeFocused();
  await expect(picker.getByRole('link', { name: 'March 2031' })).toBeVisible();
  await picker.getByRole('button', { name: 'Enter year, 2031' }).click();
  await yearInput.fill('1969');
  await page.keyboard.press('Escape'); // cancels the edit only
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole('button', { name: 'Enter year, 2031' }),
  ).toBeFocused();
  await picker.getByRole('button', { name: 'Enter year, 2031' }).click();
  await yearInput.fill('1969');
  await yearInput.press('Enter');
  await expect(
    picker.getByRole('button', { name: 'Previous year', exact: true }),
  ).toBeDisabled();
  await picker.getByRole('button', { name: 'Enter year, 1969' }).click();
  await yearInput.fill('9998');
  await yearInput.press('Enter');
  await expect(
    picker.getByRole('button', { name: 'Next year', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(heading).toBeFocused();
  expect(page.url()).toBe(url);
  // Reopening resets from the displayed calendar, not the last browsed year.
  await heading.click();
  await expect(
    picker.getByRole('button', { name: 'Enter year, 2025' }),
  ).toBeVisible();
  await page.mouse.click(5, 5); // outside click closes
  await expect(picker).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('button', { name: 'Menu & search' }).click();
  const drawer = page.getByRole('dialog', { name: 'Notebook navigation' });
  await drawer.getByRole('button', { name: 'January 2025' }).click();
  await picker.getByRole('button', { name: 'Previous year' }).click();
  await testInfo.attach('month-picker-mobile', {
    body: await page.screenshot({
      path: testInfo.outputPath('month-picker-mobile.png'),
    }),
    contentType: 'image/png',
  });
  expect(await picker.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  const mobileMonths = await picker.getByRole('link').evaluateAll((links) =>
    links.map((link) => {
      const box = link.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }),
  );
  expect(new Set(mobileMonths.map((box) => box.x)).size).toBe(4);
  expect(new Set(mobileMonths.map((box) => box.y)).size).toBe(3);
  expect(mobileMonths.every((box) => box.width >= 44 && box.height >= 44)).toBe(
    true,
  );
  await picker
    .getByRole('link', { name: 'February 2024', exact: true })
    .click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(
    '/?tag=s11calendar&q=%22%E9%A6%99%E6%B8%AF%22&month=2024-02',
  );
  await expect(page.getByTestId('posted-note')).toHaveCount(1);
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

test('filtered timeline has no composer; scrolling and Back to Top retain filters and loaded notes', async ({
  page,
}) => {
  await start(page);
  await expect(page.getByTestId('composer')).toHaveCount(0);
  await expect(page.locator('#notes-pane')).toHaveJSProperty('scrollTop', 0);
  await page
    .locator('#notes-pane')
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(page.getByTestId('posted-note')).toHaveCount(40);
  const url = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Back to Top ↑' }).click();
  await expect(page.locator('#notes-pane')).toHaveJSProperty('scrollTop', 0);
  await expect(page.getByTestId('posted-note')).toHaveCount(40);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(page.locator('#notes-pane')).toBeFocused();
  await expect(page.getByTestId('composer')).toHaveCount(0);
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
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(page.getByTestId('posted-note')).toHaveCount(3);
  await expect(side.locator('[data-date="2024-12-31"]')).toHaveAttribute(
    'aria-label',
    /3 published notes/,
  );
  await expect(side.locator('[data-date="2024-12-31"]')).toHaveClass(
    /selected/,
  );
});

test('posting from the composer invalidates calendar counts and a delayed image preserves the top-visible month and reading anchor', async ({
  page,
}, testInfo) => {
  const { side, headers } = await start(page);
  await page.goto('/?month=2024-12');
  await expect(side.locator('[data-date="2024-12-30"]')).toHaveAttribute(
    'aria-label',
    /0 published notes/,
  );
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Write a note…' })
    .click();
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
    .getByRole('button', { name: 'Set date', exact: true })
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
