import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type Page } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';

let fixtureIds: string[] = [];
function seed() {
  const data = readdirSync('.e2e-data').find((entry) =>
    entry.startsWith('run-'),
  )!;
  const db = new Database(join('.e2e-data', data, 'db/pandanote.sqlite'));
  const now = Date.now() - 60_000;
  try {
    const result = db
      .prepare(
        "SELECT id FROM notes WHERE body_markdown LIKE 'S09 fixture %' ORDER BY timeline_at DESC, id DESC",
      )
      .all() as { id: string }[];
    if (result.length) {
      fixtureIds = result.map((n) => n.id);
      return;
    }
    db.transaction(() => {
      const common = randomUUID(),
        other = randomUUID();
      db.prepare(
        'INSERT INTO tags(id,normalized_key,display) VALUES (?,?,?)',
      ).run(common, 's09timeline', 'S09timeline');
      db.prepare(
        'INSERT INTO tags(id,normalized_key,display) VALUES (?,?,?)',
      ).run(other, 's09even', 'S09even');
      const insert = db.prepare(
        "INSERT INTO notes(id,body_markdown,status,timeline_at,created_at,updated_at,revision) VALUES (?,?,'published',?,?,?,1)",
      );
      const tag = db.prepare(
        'INSERT INTO note_tags(note_id,tag_id) VALUES (?,?)',
      );
      for (let n = 0; n < 300; n++) {
        const id = randomUUID();
        fixtureIds.push(id);
        const body =
          `S09 fixture ${n} #S09timeline ${n % 2 === 0 ? '#S09even' : ''}\n\n` +
          (n === 0 || n === 10
            ? n === 10
              ? '```text\n' + 'long original code 香港\n'.repeat(1200) + '```'
              : 'Long content 香港 図書館\n\n'.repeat(1200)
            : (n === 1
                ? '```text\n  exact code 香港  \nnext line\n```\n\n'
                : '') + 'Synthetic private memory 香港 図書館.\n\n'.repeat(12));
        insert.run(id, body, now - n * 86_400_000, now, now);
        tag.run(id, common);
        if (n % 2 === 0) tag.run(id, other);
      }
    })();
  } finally {
    db.close();
  }
}
async function start(page: Page) {
  const cookies = await browserSession(page);
  const appearance = await page.request.patch('/api/settings/appearance', {
    headers: {
      origin: 'http://127.0.0.1:4173',
      cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
    },
    data: { theme: 'light', density: 'comfortable', collapseLongNotes: true },
  });
  expect(appearance.status()).toBe(200);
  seed();
  await page.goto('/?tag=s09timeline');
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
}
async function readingAnchor(page: Page) {
  return page.locator('#notes-pane').evaluate((scroller) => {
    const top = scroller.getBoundingClientRect().top;
    const card = [
      ...scroller.querySelectorAll<HTMLElement>('[data-note-id]'),
    ].find((node) => node.getBoundingClientRect().bottom > top + 1)!;
    return {
      id: card.dataset.noteId,
      offset: card.getBoundingClientRect().top - top,
    };
  });
}
async function nearBottom(page: Page) {
  await page.locator('#notes-pane').evaluate((node) => {
    node.scrollTop = node.scrollHeight - node.clientHeight - 50;
  });
}

test('real SSR contains only the first 30 published cards; private paging, UTF-8 bounds, thumbnail routes and all-tag filtering', async ({
  page,
  browser,
}) => {
  await start(page);
  const cookies = await page.context().cookies();
  const context = await browser.newContext({ javaScriptEnabled: false });
  await context.addCookies(cookies);
  const ssr = await context.newPage();
  await ssr.goto('/?tag=s09timeline');
  await expect(ssr.getByTestId('posted-note')).toHaveCount(30);
  await expect(ssr.getByTestId('posted-note').first()).toContainText(
    'S09 fixture 0',
  );
  await expect(
    ssr.getByTestId('posted-note').first().locator('.markdown'),
  ).toContainText('Long content 香港');
  const cookie = `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`;
  const first = await page.request.get('/api/notes?tag=s09timeline', {
    headers: { cookie },
  });
  const payload = (await first.json()).data;
  expect(payload.items).toHaveLength(30);
  expect(payload.items[0].bodyTruncated).toBe(true);
  expect(Buffer.byteLength(payload.items[0].bodyMarkdown)).toBeLessThanOrEqual(
    8192,
  );
  const other = await page.request.get(
    `/api/notes?tag=s09even&cursor=${payload.nextCursor}`,
    { headers: { cookie } },
  );
  expect(other.status()).toBe(400);
  const unauthorized = await context.request.get('/api/notes', {
    headers: { cookie: '' },
    maxRedirects: 0,
  });
  expect(unauthorized.status()).toBe(401);
  await context.close();
  await page
    .getByTestId('posted-note')
    .first()
    .getByRole('link', { name: '#s09even', exact: true })
    .click();
  await expect(page).toHaveURL(/tag=s09even&tag=s09timeline/);
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  for (const note of await page.getByTestId('posted-note').all())
    await expect(note).toContainText('#s09even');
  await page.getByRole('link', { name: 'Remove tag filter s09even' }).click();
  await expect(page).toHaveURL(/\?tag=s09timeline$/);
});

test('older loading is confined to the notes pane; retry/stale-filter cancellation, history, collapse and scroll anchors work', async ({
  page,
}) => {
  await start(page);
  const card = page.getByTestId('posted-note').first();
  const initialHeight = await card
    .locator('.card-content')
    .evaluate((node) => node.clientHeight);
  expect(initialHeight).toBeLessThanOrEqual(420);
  await card.getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(
    card.getByRole('button', { name: 'Show less', exact: true }),
  ).toBeVisible();
  await expect(card).toContainText('Long content 香港');
  expect(
    await card.locator('.card-content').evaluate((node) => node.clientHeight),
  ).toBeGreaterThan(420);
  await card.getByRole('button', { name: 'Show less', exact: true }).click();
  // Collapse returns to this card, not necessarily the composer above it.
  await expect
    .poll(async () => (await readingAnchor(page)).id)
    .toBe(await card.getAttribute('data-note-id'));
  await expect(card).toBeInViewport();
  await expect(page.getByTestId('posted-note')).toHaveCount(30);
  const filtersBefore = await page
    .getByRole('region', { name: 'Active filters' })
    .boundingBox();
  await page.route('**/api/notes?*', (route) => route.abort('failed'), {
    times: 1,
  });
  await nearBottom(page);
  await expect(
    page.getByRole('button', { name: 'Retry older notes' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry older notes' }).click();
  await expect(page.getByTestId('posted-note')).toHaveCount(60);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(
    (await page.getByRole('region', { name: 'Active filters' }).boundingBox())!
      .y,
  ).toBeLessThan(filtersBefore!.y);
  const position = await readingAnchor(page);
  const topId = await page
    .locator('[data-top-month]')
    .getAttribute('data-top-month');
  expect(topId).toMatch(/^\d{4}-\d{2}$/);
  await page
    .getByRole('link', { name: 'Settings', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL('/settings');
  await page.goBack();
  await expect(page).toHaveURL('/?tag=s09timeline');
  await expect(page.getByTestId('posted-note')).toHaveCount(60);
  await expect
    .poll(async () => (await readingAnchor(page)).id)
    .toBe(position.id);
  await expect
    .poll(async () => (await readingAnchor(page)).offset)
    .toBeCloseTo(position.offset, 0);
  let seen!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => {
    seen = r;
  });
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route(
    '**/api/notes?*',
    async (route) => {
      const response = await route.fetch();
      seen();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await nearBottom(page);
  await entered;
  await page
    .getByRole('link', { name: 'Remove tag filter s09timeline' })
    .click();
  await expect(page).toHaveURL('/');
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(
    page.getByRole('region', { name: 'Active filters' }),
  ).toContainText('no active filters');
  await expect
    .poll(() => page.locator('#notes-pane').evaluate((node) => node.scrollTop))
    .toBe(0);
});

test('bounded 300-card DOM growth is measured before virtualization; menu lifecycle and mobile overflow are real', async ({
  page,
}) => {
  await start(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const baseline = await cdp.send('Performance.getMetrics');
  for (let n = 60; n <= 300; n += 30) {
    await nearBottom(page);
    await expect(page.getByTestId('posted-note')).toHaveCount(n);
  }
  await expect(page.getByText('You’ve reached the beginning.')).toBeVisible();
  const metrics = await cdp.send('Performance.getMetrics');
  const heap = (value: typeof metrics) =>
    value.metrics.find((m) => m.name === 'JSHeapUsedSize')!.value;
  const dom = await page.evaluate(() => document.querySelectorAll('*').length);
  console.log(
    `S09 DOM measurement: 300 cards, ${dom} elements, heap ${(heap(baseline) / 1048576).toFixed(1)} -> ${(heap(metrics) / 1048576).toFixed(1)} MiB (Chromium, no virtualization).`,
  );
  expect(dom).toBeLessThan(25_000);
  const race = page.getByTestId('posted-note').nth(45);
  const raceId = await race.getAttribute('data-note-id');
  const authCookies = await page.context().cookies();
  const headers = {
    origin: 'http://127.0.0.1:4173',
    cookie: `pandanote_session=${authCookies.find((c) => c.name === 'pandanote_session')!.value}`,
  };
  const base = (
    await (await page.request.get(`/api/notes/${raceId}`, { headers })).json()
  ).data;
  const update = await page.request.patch(`/api/notes/${raceId}`, {
    headers,
    data: {
      action: 'update',
      noteId: raceId,
      expectedRevision: 1,
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: 'S09 newer content #S09timeline',
        timelineAt: base.timelineAt,
        location: null,
        attachmentIds: [],
      },
    },
  });
  expect(update.status()).toBe(200);
  await race.getByRole('button', { name: 'Note actions' }).click();
  await page
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm move', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Move to Trash?' }).getByRole('alert'),
  ).toContainText('changed');
  await page.getByRole('button', { name: 'Refresh server version' }).click();
  await expect(page.locator(`[data-note-id="${raceId}"]`)).toHaveAttribute(
    'data-revision',
    '2',
  );
  await expect(page.locator(`[data-note-id="${raceId}"]`)).toContainText(
    'Edited',
  );
  await expect(page.getByTestId('posted-note')).toHaveCount(300);
  const last = page.getByTestId('posted-note').last();
  await last.getByRole('button', { name: 'Note actions' }).click();
  await page
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm move', exact: true }).click();
  await expect(page.getByTestId('posted-note')).toHaveCount(299);
  const cookies = await page.context().cookies();
  const result = await page.request.get(`/api/notes/${fixtureIds.at(-1)}`, {
    headers: {
      cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
    },
  });
  expect((await result.json()).data.status).toBe('trash');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('#notes-pane').evaluate((node) => {
    node.scrollTop = 0;
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await cdp.detach();
});

test('SSR code copy and appearance preferences apply to real cards; full source is fetched only for visible long cards', async ({
  page,
}, testInfo) => {
  await start(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await expect(
    page
      .locator(`[data-note-id="${fixtureIds[10]}"]`)
      .getByRole('button', { name: 'Copy text code' }),
  ).toBeDisabled();
  const code = page.locator(`[data-note-id="${fixtureIds[1]}"]`);
  await code.getByRole('button', { name: 'Copy text code' }).click();
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      '\r\n',
      '\n',
    ),
  ).toBe('  exact code 香港  \nnext line');
  await page.locator('#notes-pane').evaluate((node) => {
    node.scrollTop = 0;
  });
  await testInfo.attach('timeline-light-desktop', {
    body: await page.screenshot({
      path: testInfo.outputPath('timeline-light-desktop.png'),
    }),
    contentType: 'image/png',
  });
  const cookie = `pandanote_session=${(await page.context().cookies()).find((c) => c.name === 'pandanote_session')!.value}`;
  const headers = { origin: 'http://127.0.0.1:4173', cookie };
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/notes\/[0-9a-f-]+$/.test(request.url()))
      requests.push(request.url());
  });
  expect(
    (
      await page.request.patch('/api/settings/appearance', {
        headers,
        data: { theme: 'dark', density: 'compact', collapseLongNotes: false },
      })
    ).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-collapse', 'false');
  await expect
    .poll(() =>
      page
        .getByTestId('posted-note')
        .first()
        .locator('.markdown')
        .evaluate((node) => node.textContent!.length),
    )
    .toBeGreaterThan(8192);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain(fixtureIds[0]);
  await expect(
    page
      .getByTestId('posted-note')
      .first()
      .getByRole('button', { name: 'Show more', exact: true }),
  ).toHaveCount(0);
  expect(
    await page
      .getByTestId('posted-note')
      .first()
      .evaluate((node) => getComputedStyle(node).padding),
  ).toBe('13px');
  await testInfo.attach('timeline-dark-compact-mobile', {
    body: await page.screenshot({
      path: testInfo.outputPath('timeline-dark-compact-mobile.png'),
    }),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
  expect(
    (
      await page.request.patch('/api/settings/appearance', {
        headers,
        data: {
          theme: 'system',
          density: 'comfortable',
          collapseLongNotes: true,
        },
      })
    ).status(),
  ).toBe(200);
});
