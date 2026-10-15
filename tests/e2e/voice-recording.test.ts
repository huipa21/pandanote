import { expect, test } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';
import {
  clipRows,
  fakeMicrophone,
  recordClip,
  trackMicrophone,
} from '../helpers/voice.ts';

/* VN06 (VN-REC): recording behavior beyond the happy path in voice-editor. */
test.use(fakeMicrophone);

test('Pause holds the timer and Resume continues it', async ({ page }) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  const timer = strip.getByTestId('voice-timer');
  await expect(timer).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Pause' }).click();
  await expect(strip).toHaveAttribute('data-state', 'paused');
  const held = await timer.textContent();
  // Longer than the timer resolution: a running timer would have moved on.
  await page.waitForTimeout(1600);
  await expect(timer).toHaveText(held!);
  await strip.getByRole('button', { name: 'Resume' }).click();
  await expect(strip).toHaveAttribute('data-state', 'recording');
  await expect(timer).not.toHaveText(held!);
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();
  await expect(clipRows(composer)).toHaveCount(1);
});

test('two recordings give two clips in recording order', async ({ page }) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await recordClip(composer);
  await recordClip(composer);
  const names = await clipRows(composer).locator('.name').allTextContents();
  expect(names).toHaveLength(2);
  // File names carry the start time to the second, so order is lexicographic.
  expect([...names].sort()).toEqual(names);
  expect(names[0]).not.toBe(names[1]);
});

test('auto-stop at 10:00 keeps the clip and shows a notice', async ({
  page,
}) => {
  await page.clock.install();
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip).toHaveAttribute('data-state', 'recording');
  // Let the real recorder capture some audio, then jump the app clock past the limit.
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await page.clock.fastForward('10:05');
  await expect(strip).toHaveCount(0);
  await expect(clipRows(composer)).toHaveCount(1);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Recording stopped at 10:00. The clip was added.' }),
  ).toBeVisible();
  // A clip-only note is postable.
  await expect(
    composer.getByRole('button', { name: 'Post', exact: true }),
  ).toBeEnabled();
});

test('a missing microphone shows a message, adds no clip and leaves the editor usable', async ({
  page,
}) => {
  const mic = await trackMicrophone(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('none', 'NotFoundError'));
  });
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'No microphone was found.' }),
  ).toBeVisible();
  await expect(composer.getByTestId('voice-recorder')).toHaveCount(0);
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  expect(mic.live()).toBe(0);
  await composer.getByRole('textbox', { name: 'Note text' }).fill('still ok');
  await expect(
    composer.getByRole('button', { name: 'Post', exact: true }),
  ).toBeEnabled();
});

test('an insecure context disables recording with the reason, editor still usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false });
  });
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const record = composer.getByRole('button', { name: 'Record a voice clip' });
  await expect(record).toBeDisabled();
  await expect(record).toHaveAttribute(
    'title',
    'Recording needs a secure (HTTPS) connection.',
  );
  await composer.getByRole('textbox', { name: 'Note text' }).fill('no mic');
  await expect(
    composer.getByRole('button', { name: 'Post', exact: true }),
  ).toBeEnabled();
});

test('a browser without MediaRecorder disables recording with the reason', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'MediaRecorder', { value: undefined });
  });
  await browserSession(page);
  await page.goto('/');
  const record = page
    .getByTestId('composer')
    .getByRole('button', { name: 'Record a voice clip' });
  await expect(record).toBeDisabled();
  await expect(record).toHaveAttribute(
    'title',
    'This browser cannot record audio.',
  );
});

test('the microphone track ends on Stop, Cancel and navigation with Discard', async ({
  page,
}) => {
  const mic = await trackMicrophone(page);
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const strip = composer.getByTestId('voice-recorder');

  // Stop.
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(strip).toHaveAttribute('data-state', 'recording');
  expect(mic.live()).toBe(1);
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();
  await expect(strip).toHaveCount(0);
  await expect.poll(mic.live).toBe(0);

  // Cancel while recording.
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(strip).toHaveAttribute('data-state', 'recording');
  expect(mic.live()).toBe(1);
  await strip.getByRole('button', { name: 'Discard take' }).click();
  await expect.poll(mic.live).toBe(0);

  // Cancel while paused.
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(strip).toHaveAttribute('data-state', 'recording');
  await strip.getByRole('button', { name: 'Pause' }).click();
  await expect(strip).toHaveAttribute('data-state', 'paused');
  await strip.getByRole('button', { name: 'Discard take' }).click();
  await expect.poll(mic.live).toBe(0);

  // Navigating away with Discard.
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(strip).toHaveAttribute('data-state', 'recording');
  expect(mic.live()).toBe(1);
  await page.getByRole('link', { name: 'Trash', exact: true }).first().click();
  await page
    .getByRole('dialog', { name: 'Unsaved changes' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(page).toHaveURL(/trash/);
  await expect.poll(mic.live).toBe(0);
  expect(mic.opened()).toBe(4);
});

test('a full page load of the login screen (the last step of Sign out) releases the microphone', async ({
  page,
}) => {
  // Sign out is only offered on Settings, and reaching Settings with a take open already
  // asks to Discard it (covered above). The last step of Sign out is a full page load of
  // /login; that must release a device a take still holds (pagehide).
  const mic = await trackMicrophone(page);
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(composer.getByTestId('voice-recorder')).toHaveAttribute(
    'data-state',
    'recording',
  );
  expect(mic.live()).toBe(1);
  // The unsaved-work prompt (beforeunload) is expected for a take that is still open.
  const prompted = page.waitForEvent('dialog');
  void page.evaluate(() => window.location.assign('/login'));
  await (await prompted).accept();
  await page.waitForURL(/\/(login)?$/);
  // The device was stopped (pagehide), not merely dropped with the document.
  await expect
    .poll(() => mic.stopsInTab().catch(() => -1)) // -1: still navigating
    .toBe(1);
  await expect(page.getByTestId('voice-recorder')).toHaveCount(0);
});
