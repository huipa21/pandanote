import { expect, test, type Page } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';

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
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
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
