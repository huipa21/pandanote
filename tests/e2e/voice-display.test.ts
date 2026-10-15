import { expect, test, type Page } from '@playwright/test';
import {
  authenticatedHeaders,
  browserSession,
} from '../helpers/browser-session.ts';
import { axeViolationsIn } from '../helpers/voice.ts';

/* VN05: stored clips on timeline cards and the note page. */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

/** Posts a note with clips; resolves to the clip names in recorded order. */
async function postClips(page: Page, text: string, count: number) {
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('textbox', { name: 'Note text' }).fill(text);
  for (let index = 0; index < count; index += 1) {
    await composer.getByRole('button', { name: 'Record a voice clip' }).click();
    const strip = composer.getByTestId('voice-recorder');
    await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
    await strip.getByRole('button', { name: 'Stop and add clip' }).click();
    await expect(
      composer.getByTestId('clip-list').getByRole('listitem'),
    ).toHaveCount(index + 1);
  }
  const names = await composer
    .getByTestId('clip-list')
    .locator('.name')
    .allTextContents();
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  return names;
}

test('cards and the note page show clips; one plays at a time', async ({
  page,
}) => {
  await browserSession(page);
  const text = `voice display ${Date.now()}`;
  await postClips(page, text, 2);
  const card = page
    .getByTestId('posted-note')
    .filter({ hasText: text })
    .first();
  const clips = card.getByTestId('voice-clip');
  await expect(clips).toHaveCount(2);
  // Native audio with deferred loading, a filename and a download link; not a plain file row.
  const audios = card.locator('audio');
  await expect(audios.first()).toHaveAttribute('preload', 'none');
  await expect(audios.first()).toHaveAttribute('controls', '');
  await expect(clips.first()).toContainText(
    /voice-\d{8}-\d{6}\.(webm|ogg|m4a)/,
  );
  await expect(
    clips.first().getByRole('link', { name: /^Download voice-/ }),
  ).toHaveAttribute('href', /\/file\?download=1$/);
  await expect(card.getByRole('list', { name: 'Attachments' })).toHaveCount(0);

  // Starting the second clip pauses the first.
  await audios.first().evaluate((el: HTMLAudioElement) => el.play());
  await expect
    .poll(() => audios.first().evaluate((el: HTMLAudioElement) => !el.paused))
    .toBe(true);
  await audios.nth(1).evaluate((el: HTMLAudioElement) => el.play());
  await expect
    .poll(() => audios.first().evaluate((el: HTMLAudioElement) => el.paused))
    .toBe(true);
  await expect
    .poll(() => audios.nth(1).evaluate((el: HTMLAudioElement) => !el.paused))
    .toBe(true);

  // The note page shows the same clips and the inline editor keeps them.
  await card.locator('a.when').click();
  await expect(page).toHaveURL(/\/notes\//);
  const detail = page.getByTestId('note-detail');
  await expect(detail.getByTestId('voice-clip')).toHaveCount(2);
  await expect(detail.locator('audio').first()).toHaveAttribute(
    'preload',
    'none',
  );
  await detail.getByRole('button', { name: 'Edit', exact: true }).click();
  const list = detail.getByTestId('clip-list');
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await list
    .getByRole('listitem')
    .first()
    .getByRole('button', { name: /^Remove / })
    .click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
});

/* VN06 (VN-PLAY). */
test('clips render in recorded order with deferred loading and are keyboard operable', async ({
  page,
}) => {
  await browserSession(page);
  const text = `voice order ${Date.now()}`;
  const names = await postClips(page, text, 3);
  const card = page
    .getByTestId('posted-note')
    .filter({ hasText: text })
    .first();
  await expect(card.getByTestId('voice-clip').locator('.name')).toHaveText(
    names,
  );
  const audios = card.locator('audio');
  await expect(audios).toHaveCount(3);
  for (const audio of await audios.all()) {
    await expect(audio).toHaveAttribute('preload', 'none');
    await expect(audio).toHaveAttribute(
      'src',
      /^\/api\/attachments\/[^/]+\/file$/,
    );
  }
  // Keyboard: focus the native control, Space plays, Space pauses.
  const first = audios.first();
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('Space');
  await expect
    .poll(() => first.evaluate((el: HTMLAudioElement) => !el.paused))
    .toBe(true);
  await page.keyboard.press('Space');
  await expect
    .poll(() => first.evaluate((el: HTMLAudioElement) => el.paused))
    .toBe(true);
  // The download link is a normal tab stop.
  const link = card
    .getByTestId('voice-clip')
    .first()
    .getByRole('link', { name: /^Download voice-/ });
  await link.focus();
  await expect(link).toBeFocused();
});

test('a collapsed long card requests no audio until Play, then only that clip', async ({
  page,
}) => {
  await browserSession(page);
  const text = `voice long ${Date.now()}`;
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
  await postClips(page, `${text}\n\n${lines.join('\n\n')}`, 2);
  const requested: string[] = [];
  page.on('request', (request) => {
    const match = /\/api\/attachments\/([^/]+)\/file/.exec(request.url());
    if (match) requested.push(match[1]!);
  });
  await page.goto('/');
  const card = page
    .getByTestId('posted-note')
    .filter({ hasText: text })
    .first();
  await expect(card.getByTestId('voice-clip')).toHaveCount(2);
  await expect(card.getByRole('button', { name: 'Show more' })).toBeVisible();
  await page.waitForTimeout(800); // a deferred request would have started by now
  expect(requested).toEqual([]);

  const first = card.locator('audio').first();
  const firstId = (await first.getAttribute('src'))!.split('/')[3]!;
  await first.evaluate((el: HTMLAudioElement) => el.play());
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(new Set(requested)).toEqual(new Set([firstId]));
});

test('clip rows have no axe violations on cards and the note page at 390/1280 px, light and dark', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await browserSession(page);
  const text = `voice axe ${Date.now()}`;
  await postClips(page, text, 2);
  const noteId = (await page
    .getByTestId('posted-note')
    .filter({ hasText: text })
    .first()
    .getAttribute('data-note-id'))!;
  const headers = await authenticatedHeaders(page);
  const appearance = (theme: 'system' | 'light' | 'dark') =>
    page.request.patch('/api/settings/appearance', {
      headers,
      data: { theme, density: 'comfortable', collapseLongNotes: true },
    });
  const cardSelector = `[data-testid="posted-note"][data-note-id="${noteId}"]`;
  try {
    for (const theme of ['light', 'dark'] as const) {
      expect((await appearance(theme)).status()).toBe(200);
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await expect(
          page.locator(cardSelector).getByTestId('voice-clip'),
        ).toHaveCount(2);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        expect(
          await axeViolationsIn(page, cardSelector),
          `card ${theme} ${width}`,
        ).toEqual([]);
        await page.goto(`/notes/${noteId}`);
        await expect(
          page.getByTestId('note-detail').getByTestId('voice-clip'),
        ).toHaveCount(2);
        expect(
          await axeViolationsIn(page, '[data-testid="note-detail"]'),
          `detail ${theme} ${width}`,
        ).toEqual([]);
      }
    }
  } finally {
    await appearance('system');
  }
});
