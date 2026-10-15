import { expect, test } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';
import { clipRows, fakeMicrophone } from '../helpers/voice.ts';

/* Naming and renaming clips, the compact clip chip and the microphone level meter.
 * Chromium's fake device supplies a synthetic tone, so no real microphone is involved. */
test.use(fakeMicrophone);

test('a new take offers its generated name for editing; Enter saves it, Escape keeps the default', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer
    .getByRole('textbox', { name: 'Note text' })
    .fill(`naming ${Date.now()}`);

  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();

  const input = composer.getByTestId('clip-name-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(/^voice-\d{8}-\d{6}$/);
  // The extension is fixed and shown beside the field.
  await expect(clipRows(composer).first()).toContainText(/\.(webm|ogg|m4a)/);
  await input.fill('Weekly sync');
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  const chip = clipRows(composer).first();
  await expect(chip.locator('.name')).toHaveText(
    /^Weekly sync\.(webm|ogg|m4a)$/,
  );
  // Focus returns to the microphone button, ready for the next take.
  await expect(
    composer.getByRole('button', { name: 'Record a voice clip' }),
  ).toBeFocused();

  // The pencil renames later; Escape discards the typed text.
  await chip.getByRole('button', { name: /^Rename Weekly sync/ }).click();
  await expect(input).toHaveValue('Weekly sync');
  await input.fill('Typed then abandoned');
  await input.press('Escape');
  await expect(chip.locator('.name')).toHaveText(/^Weekly sync\./);
  await chip.getByRole('button', { name: /^Rename / }).click();
  // An empty name keeps the current one; characters unsafe in filenames are replaced.
  await input.fill('   ');
  await input.press('Enter');
  await expect(chip.locator('.name')).toHaveText(/^Weekly sync\./);
  await chip.getByRole('button', { name: /^Rename / }).click();
  await input.fill('plan/b: draft');
  // Clicking Save name applies the name too.
  await chip.getByRole('button', { name: 'Save name' }).click();
  await expect(chip.locator('.name')).toHaveText(
    /^plan-b- draft\.(webm|ogg|m4a)$/,
  );

  // The renamed file is what gets stored and shown.
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(composer.getByTestId('clip-list')).toHaveCount(0);
  const card = page
    .getByTestId('posted-note')
    .filter({ hasText: 'naming' })
    .first();
  await expect(card.getByTestId('voice-clip').locator('.name')).toHaveText(
    /^plan-b- draft\.(webm|ogg|m4a)$/,
  );
});

test('a name being typed is applied when Post is pressed', async ({ page }) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const text = `blur naming ${Date.now()}`;
  await composer.getByRole('textbox', { name: 'Note text' }).fill(text);
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();
  await composer.getByTestId('clip-name-input').fill('Typed, not confirmed');
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  const card = page.getByTestId('posted-note').filter({ hasText: text });
  await expect(card.getByTestId('voice-clip').locator('.name')).toHaveText(
    /^Typed, not confirmed\.(webm|ogg|m4a)$/,
  );
});

test('a saved clip is a compact icon chip that plays when clicked', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const text = `chip ${Date.now()}`;
  await composer.getByRole('textbox', { name: 'Note text' }).fill(text);
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();
  await composer.getByTestId('clip-name-input').press('Enter');
  await composer.getByRole('button', { name: 'Post', exact: true }).click();

  const card = page.getByTestId('posted-note').filter({ hasText: text });
  const chip = card.getByTestId('voice-clip');
  await expect(chip).toHaveCount(1);
  const box = await chip.boundingBox();
  expect(box!.height).toBeLessThan(48);
  expect(box!.width).toBeLessThan(400);
  const audio = chip.locator('audio');
  await expect(audio).not.toHaveAttribute('controls', /.*/);
  await chip.getByRole('button', { name: /^Play / }).click();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => !el.paused))
    .toBe(true);
  await chip.getByRole('button', { name: /^Pause / }).click();
  await expect
    .poll(() => audio.evaluate((el: HTMLAudioElement) => el.paused))
    .toBe(true);
});

test('the level meter reaches a clearly visible level while recording', async ({
  page,
}) => {
  await browserSession(page);
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  const meter = strip.getByRole('meter', { name: 'Microphone level' });
  await expect(strip).toHaveAttribute('data-state', 'recording');
  // The fake device beeps: the bar reaches a clearly visible level.
  await expect
    .poll(async () => Number(await meter.getAttribute('aria-valuenow')), {
      timeout: 10_000,
    })
    .toBeGreaterThan(30);
  await expect(strip.getByTestId('voice-quiet')).toHaveCount(0);
  await strip.getByRole('button', { name: 'Discard take' }).click();
});

async function postOneClip(
  page: import('@playwright/test').Page,
  text: string,
) {
  await page.goto('/');
  const composer = page.getByTestId('composer');
  await composer.getByRole('textbox', { name: 'Note text' }).fill(text);
  await composer.getByRole('button', { name: 'Record a voice clip' }).click();
  const strip = composer.getByTestId('voice-recorder');
  await expect(strip.getByTestId('voice-timer')).not.toHaveText('0:00');
  await strip.getByRole('button', { name: 'Stop and add clip' }).click();
  await composer.getByTestId('clip-name-input').press('Enter');
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  const card = page.getByTestId('posted-note').filter({ hasText: text });
  await expect(card.getByTestId('voice-clip')).toHaveCount(1);
  return card;
}

test('a saved clip is renamed from its card and the name survives a reload', async ({
  page,
}) => {
  await browserSession(page);
  const text = `saved rename ${Date.now()}`;
  const card = await postOneClip(page, text);
  const chip = card.getByTestId('voice-clip');
  await chip.getByRole('button', { name: /^Rename voice-/ }).click();
  const input = chip.getByTestId('clip-name-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(/^voice-\d{8}-\d{6}$/);
  // Escape leaves the stored name alone.
  await input.fill('nope');
  await input.press('Escape');
  await expect(chip.locator('.name')).toHaveText(/^voice-/);
  await chip.getByRole('button', { name: /^Rename voice-/ }).click();
  await input.fill('Standup notes');
  await input.press('Enter');
  await expect(chip.locator('.name')).toHaveText(
    /^Standup notes\.(webm|ogg|m4a)$/,
  );
  await expect(
    chip.getByRole('link', { name: /^Download Standup notes/ }),
  ).toBeVisible();
  await expect(
    chip.getByRole('button', { name: /^Rename Standup notes/ }),
  ).toBeFocused();

  // The stored name changed: a reload and the note page show it, and it is searchable.
  await page.reload();
  const again = page.getByTestId('posted-note').filter({ hasText: text });
  await expect(again.getByTestId('voice-clip').locator('.name')).toHaveText(
    /^Standup notes\./,
  );
  const noteId = (await again.getAttribute('data-note-id'))!;
  await page.goto(`/notes/${noteId}`);
  await expect(
    page.getByTestId('note-detail').getByTestId('voice-clip').locator('.name'),
  ).toHaveText(/^Standup notes\./);
  await page.goto(`/?q=${encodeURIComponent('Standup notes')}`);
  await expect(
    page.getByTestId('posted-note').filter({ hasText: text }),
  ).toHaveCount(1);
});

test('a saved clip is renamed while editing its note without making the editor dirty', async ({
  page,
}) => {
  await browserSession(page);
  const text = `editor saved rename ${Date.now()}`;
  const card = await postOneClip(page, text);
  const noteId = (await card.getAttribute('data-note-id'))!;
  await page.goto(`/notes/${noteId}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByTestId('inline-editor');
  const row = clipRows(editor);
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /^Rename voice-/ }).click();
  await row.getByTestId('clip-name-input').fill('Renamed in editor');
  await row.getByRole('button', { name: 'Save name' }).click();
  await expect(row.locator('.name')).toHaveText(
    /^Renamed in editor\.(webm|ogg|m4a)$/,
  );
  // The rename is already stored, so Cancel does not ask about unsaved changes.
  await editor.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByTestId('note-detail').getByTestId('voice-clip').locator('.name'),
  ).toHaveText(/^Renamed in editor\./);
  await page.reload();
  await expect(
    page.getByTestId('note-detail').getByTestId('voice-clip').locator('.name'),
  ).toHaveText(/^Renamed in editor\./);
});
