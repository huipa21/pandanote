import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { authenticatedHeaders } from '../helpers/browser-session.ts';

const password = 'synthetic-e2e-only-secret 密碼';

test('Vault verifies the password, scopes private content, survives refresh and closes in every tab without losing a public draft', async ({
  page,
  context,
}) => {
  const headers = await authenticatedHeaders(page);
  await page.request.post('/api/auth/vault', {
    headers,
    data: { action: 'close' },
  });
  const unique = randomUUID();
  const publicText = `Vault public ${unique}`;
  const privateText = `Vault secret ${unique}`;
  const tag = `vault${unique.replaceAll('-', '')}`;
  await page.goto('/');
  const composer = page.getByTestId('composer');
  const privacy = composer.getByRole('button', {
    name: 'Private note',
    exact: true,
  });
  await expect(privacy).toHaveAttribute('aria-pressed', 'false');
  await composer.getByRole('textbox').fill(publicText);
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(
    page.getByTestId('posted-note').filter({ hasText: publicText }),
  ).toBeVisible();
  await composer.getByRole('textbox').fill(`${privateText} #${tag}`);
  await privacy.click();
  await expect(privacy).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'private-vault-file.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('synthetic private bytes'),
  });
  await expect(composer.getByRole('list', { name: 'Files (1)' })).toBeVisible();
  const committed = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/notes' &&
      r.request().method() === 'POST',
  );
  await composer.getByRole('button', { name: 'Post', exact: true }).click();
  const response = await committed;
  const { data: saved } = await response.json();
  const attachmentId = response.request().postDataJSON().content
    .attachmentIds[0] as string;
  await expect(composer.getByRole('textbox')).toHaveValue('');
  await expect(privacy).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: `#${tag}`, exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.get(`/api/notes/${saved.noteId}`, { headers })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(`/api/attachments/${attachmentId}/file`, {
        headers,
      })
    ).status(),
  ).toBe(404);
  await page.goto(`/?q=${encodeURIComponent(privateText)}`);
  await expect(
    page.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Vault', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unlock Vault' });
  await dialog.getByLabel('Password', { exact: true }).fill('wrong-password');
  await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(dialog.getByRole('alert')).not.toBeEmpty();
  await expect(
    page.getByRole('button', { name: 'Close Vault', exact: true }),
  ).toHaveCount(0);
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL('/?vault=1');
  await expect(
    page.getByRole('heading', { name: 'Vault', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toBeVisible();
  await expect(
    page.getByTestId('posted-note').filter({ hasText: publicText }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'PandaNote', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByTestId('posted-note').filter({ hasText: publicText }),
  ).toBeVisible();
  await expect(
    page.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(`/api/attachments/${attachmentId}/file`, {
        headers,
      })
    ).status(),
  ).toBe(200);
  await page.goto(`/?tag=${tag}`);
  await expect(
    page.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toBeVisible();
  await page.goto(`/?q=${encodeURIComponent(privateText)}`);
  await expect(
    page.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain(`${privateText} #${tag}`);
  const other = await context.newPage();
  await other.goto('/');
  await expect(
    other.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toBeVisible();
  await other
    .getByTestId('composer')
    .getByRole('textbox')
    .fill('Keep this public draft');
  await page.route('**/api/auth/vault', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch();
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'Close Vault', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.unroute('**/api/auth/vault');
  await expect(
    other.getByRole('button', { name: 'Vault', exact: true }),
  ).toBeVisible();
  await expect(
    other.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toHaveCount(0);
  await expect(other.getByTestId('composer').getByRole('textbox')).toHaveValue(
    'Keep this public draft',
  );
  await page.goBack();
  await expect(
    page.getByTestId('posted-note').filter({ hasText: privateText }),
  ).toHaveCount(0);
  expect(
    (
      await page.request.get(`/api/notes/${saved.noteId}`, { headers })
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get(`/api/attachments/${attachmentId}/file`, {
        headers,
      })
    ).status(),
  ).toBe(404);
  await other.getByTestId('composer').getByRole('textbox').fill('');
  await other.close();
});

test('editing privacy removes an ordinary card while closed and preserves the private flag when reopened', async ({
  page,
}) => {
  const headers = await authenticatedHeaders(page);
  await page.request.post('/api/auth/vault', {
    headers,
    data: { action: 'close' },
  });
  const text = `Vault editable ${randomUUID()}`;
  const created = await page.request.post('/api/notes', {
    headers,
    data: {
      action: 'create',
      mutationId: randomUUID(),
      content: { bodyMarkdown: text, attachmentIds: [], timelineAt: null },
    },
  });
  const id = (await created.json()).data.noteId as string;
  await page.goto(`/?q=${encodeURIComponent(text)}`);
  const card = page.getByTestId('posted-note').filter({ hasText: text });
  await card.getByRole('button', { name: 'Note actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await card.getByRole('button', { name: 'Private note', exact: true }).click();
  await card.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Vault', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Unlock Vault' });
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Unlock', exact: true }).click();
  await expect(page).toHaveURL('/?vault=1');
  await card.getByRole('button', { name: 'Note actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(
    card.getByRole('button', { name: 'Private note', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: 'Private note', exact: true }).click();
  await card.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Close Vault', exact: true }).click();
  expect(
    (await (await page.request.get(`/api/notes/${id}`, { headers })).json())
      .data.isPrivate,
  ).toBe(false);
});
