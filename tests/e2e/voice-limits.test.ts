import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { browserSession } from '../helpers/browser-session.ts';
import { clipRows, fakeMicrophone, recordClip } from '../helpers/voice.ts';

/* VN06 (VN-LIMIT): clip, photo and video limits in the real editor. The per-note
 * attachment cap and the 50 MB file rule are unit-tested (voice-clips.test.ts). */
test.use(fakeMicrophone);

async function pngs(count: number, prefix: string) {
  const buffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: 'teal' },
  })
    .png()
    .toBuffer();
  return Array.from({ length: count }, (_, i) => ({
    name: `${prefix}${i}.png`,
    mimeType: 'image/png',
    buffer,
  }));
}
const video = (name: string) => ({
  name,
  mimeType: 'video/mp4',
  buffer: Buffer.from('video bytes'),
});

test('the 21st clip is refused and the 20 existing clips are kept', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  for (let i = 0; i < 20; i++) await recordClip(composer);
  await expect(clipRows(composer)).toHaveCount(20);
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'at most 20 voice clips to one note' }),
  ).toBeVisible();
  await expect(composer.getByTestId('voice-recorder')).toHaveCount(0);
  await expect(clipRows(composer)).toHaveCount(20);
  // Removing one frees a slot again.
  await clipRows(composer)
    .first()
    .getByRole('button', { name: /^Remove / })
    .click();
  await recordClip(composer);
  await expect(clipRows(composer)).toHaveCount(20);
});

test('clips and nine photos coexist; clips do not count toward the photo limit', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const input = page.getByLabel('Choose local files');
  await recordClip(composer);
  await recordClip(composer);
  await input.setInputFiles(await pngs(9, 'p'));
  await expect(
    composer.getByRole('list', { name: 'Attachments (9)' }),
  ).toBeVisible();
  await expect(clipRows(composer)).toHaveCount(2);
  // The tenth photo is refused by the photo limit, not by the clips.
  await input.setInputFiles(await pngs(1, 'tenth'));
  await expect(
    page.getByRole('alert').filter({ hasText: 'at most 9 photos' }),
  ).toBeVisible();
  // A clip is still accepted with nine photos.
  await recordClip(composer);
  await expect(clipRows(composer)).toHaveCount(3);
  await expect(
    composer.getByRole('list', { name: 'Attachments (9)' }),
  ).toBeVisible();
});

test('a video excludes clips in both directions', async ({ page }) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const input = page.getByLabel('Choose local files');

  // Clip first, then a video.
  await recordClip(composer);
  await input.setInputFiles(video('late.mp4'));
  await expect(
    page.getByRole('alert').filter({ hasText: 'A video cannot be combined' }),
  ).toBeVisible();
  await expect(clipRows(composer)).toHaveCount(1);
  await expect(
    composer.getByRole('list', { name: /^Attachments/ }),
  ).toHaveCount(0);

  // Video first, then a clip.
  await clipRows(composer)
    .first()
    .getByRole('button', { name: /^Remove / })
    .click();
  await input.setInputFiles(video('first.mp4'));
  await expect(
    composer.getByRole('list', { name: 'Attachments (1)' }),
  ).toBeVisible();
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'A note with a video cannot also have voice clips.' }),
  ).toBeVisible();
  await expect(composer.getByTestId('voice-recorder')).toHaveCount(0);
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
});

test('a clip-only note is postable, and an empty note is still refused', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const post = composer.getByRole('button', { name: 'Post', exact: true });
  await expect(post).toBeDisabled();
  await recordClip(composer);
  await expect(post).toBeEnabled();
  await clipRows(composer)
    .first()
    .getByRole('button', { name: /^Remove / })
    .click();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  // Back to empty: refused again.
  await expect(post).toBeDisabled();
});
