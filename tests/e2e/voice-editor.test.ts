import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';
import { acceptClipName } from '../helpers/voice.ts';

/* VN04: the recorder strip and clip rows in the editor. Chromium's fake device
 * supplies a synthetic tone, so no real microphone is involved. */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

test('record, pause, stop adds a clip row; Post is disabled while recording', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('textbox', { name: 'Note text' }).fill('with voice');
  const post = composer.getByRole('button', {
    name: /^(Post|Stop recording first)$/,
  });
  await expect(post).toBeEnabled();

  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip).toHaveAttribute('data-state', 'recording');
  await expect(
    composer.getByRole('button', { name: 'Stop recording first' }),
  ).toBeDisabled();
  // Disabled buttons are visibly dimmed, not only relabelled.
  await expect(
    composer.getByRole('button', { name: 'Stop recording first' }),
  ).toHaveCSS('opacity', '0.55');
  await expect(
    strip.getByRole('button', { name: 'Stop and add clip' }),
  ).toBeFocused();
  await expect(
    composer.getByRole('button', { name: 'Record a voice clip' }),
  ).toBeDisabled();

  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Pause' }).click();
  await expect(strip).toHaveAttribute('data-state', 'paused');
  await strip.getByRole('button', { name: 'Resume' }).click();
  await expect(strip).toHaveAttribute('data-state', 'recording');
  // The take survives opening and closing focus mode.
  await composer.getByRole('button', { name: 'Enter focus mode' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('voice-recorder')).toHaveAttribute(
    'data-state',
    'recording',
  );
  await dialog.getByRole('button', { name: 'Stop and add clip' }).click();
  const row = dialog.getByTestId('clip-list').getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(dialog.getByTestId('voice-recorder')).toHaveCount(0);
  // The new clip opens its name field with the generated name selected and focused.
  const nameInput = dialog.getByTestId('clip-name-input');
  await expect(nameInput).toBeFocused();
  await expect(nameInput).toHaveValue(/^voice-\d{8}-\d{6}$/);
  await nameInput.press('Enter');
  await expect(row).toContainText(/voice-\d{8}-\d{6}\.(webm|ogg|m4a)/);
  await expect(
    dialog.getByRole('button', { name: 'Record a voice clip' }),
  ).toBeFocused();

  // A second clip, then reorder with Alt+Arrow and remove.
  await dialog.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(dialog.getByTestId('voice-recorder')).toHaveAttribute(
    'data-state',
    'recording',
  );
  await expect(dialog.getByTestId('voice-timer')).not.toHaveText('0:00');
  await dialog.getByRole('button', { name: 'Stop and add clip' }).click();
  await acceptClipName(dialog);
  const rows = dialog.getByTestId('clip-list').getByRole('listitem');
  await expect(rows).toHaveCount(2);
  const names = await rows.locator('.name').allTextContents();
  await rows
    .nth(1)
    .getByRole('button', { name: /^Play / })
    .focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(rows.locator('.name')).toHaveText([names[1], names[0]]);
  await rows
    .nth(0)
    .getByRole('button', { name: /^Remove / })
    .click();
  await expect(rows).toHaveCount(1);
});

test('cancel discards the take and leaves a clean editor', async ({ page }) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip).toHaveAttribute('data-state', 'recording');
  await strip.getByRole('button', { name: 'Discard take' }).click();
  await expect(strip).toHaveCount(0);
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  await expect(
    composer.getByRole('button', { name: 'Record a voice clip' }),
  ).toBeEnabled();
  // Nothing was recorded or kept, so the editor is clean again.
  await expect(composer.getByRole('button', { name: 'Post' })).toBeDisabled();
});

test('a denied microphone shows a localized error and records nothing', async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /Microphone access was denied/ })
      .first(),
  ).toBeVisible();
  await expect(composer.getByTestId('voice-recorder')).toHaveCount(0);
});

test('an active take counts as unsaved work: navigation asks, Discard stops it', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(composer.getByTestId('voice-recorder')).toHaveAttribute(
    'data-state',
    'recording',
  );
  await page.getByRole('link', { name: 'Trash', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved changes' });
  await expect(dialog).toBeVisible();
  // Nothing can be posted while the take is open; Keep editing leaves it running.
  await expect(dialog.getByRole('button', { name: 'Post' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(composer.getByTestId('voice-recorder')).toHaveAttribute(
    'data-state',
    'recording',
  );
  await page.getByRole('link', { name: 'Trash', exact: true }).first().click();
  await dialog.getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(/trash/);
  await page.goto('/');
  await expect(
    page.getByTestId('composer').getByTestId('voice-recorder'),
  ).toHaveCount(0);
});

test('a clip-only note posts through the upload pipeline and clears the editor', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();
  await expect(composer.getByTestId('clip-list')).toBeVisible();
  const post = composer.getByRole('button', { name: 'Post', exact: true });
  await expect(post).toBeEnabled();
  await post.click();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('mobile layout (390 px): focus-mode recorder strip fits and targets are 44 px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await browserSession(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Compose a note' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = dialog.getByTestId('voice-recorder');
  await expect(strip).toHaveAttribute('data-state', 'recording');
  const box = (await strip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  for (const button of await strip.getByRole('button').all()) {
    const target = (await button.boundingBox())!;
    expect(target.height).toBeGreaterThanOrEqual(43.5);
  }
  await page.screenshot({ path: testInfo.outputPath('mobile.png') });
  await strip.getByRole('button', { name: 'Discard take' }).click();
});

test('recorder strip and clip rows have no axe WCAG 2.x AA violations', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  await expect(strip).toHaveAttribute('data-state', 'recording');
  await page.evaluate(
    readFileSync(
      createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
      'utf8',
    ),
  );
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (
            context: Element | undefined,
            options: unknown,
          ) => Promise<{ violations: { id: string; help: string }[] }>;
        };
      }
    ).axe;
    const root = document.querySelector('[data-testid="composer"]')!;
    const result = await axe.run(root, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      resultTypes: ['violations'],
    });
    return result.violations.map((v) => `${v.id}: ${v.help}`);
  });
  expect(violations).toEqual([]);
  await strip.getByRole('button', { name: 'Discard take' }).click();
});

test('a Stop pressed right after Start adds no clip and says it was too short', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const record = composer.getByRole('button', { name: 'Record a voice clip' });
  await record.click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip).toHaveAttribute('data-state', 'recording');
  // Chromium yields an empty or header-only blob for a take this short.
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();
  await expect(strip).toHaveCount(0);
  await expect(
    page.getByRole('alert').filter({
      hasText: 'The recording was too short, so no clip was added.',
    }),
  ).toBeVisible();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  await expect(record).toBeFocused();
  // A normal take afterwards still works and clears the message.
  await record.click();
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();
  await expect(
    composer.getByTestId('clip-list').getByRole('listitem'),
  ).toHaveCount(1);
  await expect(
    page.getByRole('alert').filter({ hasText: 'too short' }),
  ).toHaveCount(0);
});
