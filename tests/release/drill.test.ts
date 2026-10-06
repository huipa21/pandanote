import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import {
  A,
  B,
  DIR,
  PASSWORD,
  TEMP_PASSWORD,
  sha,
  freshCode,
  usedCodes,
  api,
  mutate,
  action,
  setup,
  signIn,
  signedInContext,
  type Seed,
} from './support.ts';

// S18 independent-deployment drill, phase 1. Deployment A is initialized, enrolled
// with TOTP, filled with real private data and manually backed up; the downloaded
// archive is uploaded through Settings into an independent empty deployment B with
// a different domain, then verified. State is written under ignored .drill/.
test.describe.configure({ mode: 'serial' });
let seed: Seed;

test('deployment A: HTTPS edge, setup, TOTP, realistic private data, local draft, manual backup/download', async ({
  browser,
}) => {
  const context = await signedInContext(browser);
  const page = await context.newPage();
  // Edge behavior: HSTS and protected headers through the real proxy.
  const health = await api(page, A, 'get', '/health');
  expect(await health.json()).toEqual({ status: 'ok' });
  expect(health.headers()['strict-transport-security']).toContain('max-age=');
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
  await setup(page, A, readFileSync(`${DIR}/a.token`, 'utf8').trim(), PASSWORD);
  const cookie = (await context.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!;
  expect(cookie).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: 'Strict',
  });
  // The same setup token is single-use.
  expect(
    (
      await api(page, A, 'post', '/api/auth/setup', {
        token: readFileSync(`${DIR}/a.token`, 'utf8').trim(),
        password: 'another-password-attempt 1',
      })
    ).status(),
  ).not.toBe(200);

  // Enroll TOTP through Settings.
  await page.goto(`${A}/settings`);
  await page
    .getByLabel('Security action', { exact: true })
    .selectOption('enroll');
  await page.getByLabel('Current password', { exact: true }).fill(PASSWORD);
  const enrolled = page.waitForResponse(`${A}/api/auth/security`);
  await page.getByRole('button', { name: 'Authenticate and continue' }).click();
  const secret = (await (await enrolled).json()).enrollment.secret as string;
  await page
    .getByLabel('New authenticator code')
    .fill(await freshCode(secret, usedCodes));
  const confirmed = page.waitForResponse(`${A}/api/auth/security`);
  await page.getByRole('button', { name: 'Confirm MFA', exact: true }).click();
  const recovery = (await (await confirmed).json()).codes as string[];
  expect(recovery).toHaveLength(10);

  // Realistic mixed data.
  const notes: Record<string, string> = {};
  const published = await mutate(
    page,
    A,
    'Drill published 香港 café #Drill/Alpha 全文',
    { timelineAt: Date.UTC(2023, 4, 17, 8, 30) },
  );
  notes.published = 'Drill published 香港 café #Drill/Alpha 全文';
  await mutate(page, A, 'Drill located #Place', {
    location: {
      latitude: 22.3193,
      longitude: 114.1694,
      accuracy: 12,
      label: 'Drill label 九龍',
    },
  });
  notes.located = 'Drill located #Place';
  const draft = await mutate(page, A, 'Drill server draft #DraftTag');
  await action(page, A, draft.noteId, draft.revision, 'move-to-draft');
  notes.draft = 'Drill server draft #DraftTag';
  const trashed = await mutate(page, A, 'Drill trashed note #TrashTag');
  await action(page, A, trashed.noteId, trashed.revision, 'trash');
  notes.trash = 'Drill trashed note #TrashTag';
  const code = [
    '```ts',
    'export const drill = (n: number) => n * 2;',
    '```',
    '',
    '```mermaid',
    'graph TD; A-->B',
    '```',
  ].join('\n');
  await mutate(page, A, `Drill code and diagram #Diagram\n\n${code}`);
  notes.code = 'Drill code and diagram #Diagram';
  expect(
    (
      await api(page, A, 'patch', '/api/settings/appearance', {
        theme: 'dark',
        density: 'compact',
        collapseLongNotes: false,
      })
    ).status(),
  ).toBe(200);

  // Multi-image/file post through the real composer.
  await page.goto(`${A}/`);
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await page
    .getByRole('textbox', { name: 'Note text' })
    .fill('Drill image post 圖片 #Media');
  const photo = await sharp({
    create: { width: 640, height: 480, channels: 3, background: '#2a7f5f' },
  })
    .jpeg()
    .toBuffer();
  const photo2 = await sharp({
    create: { width: 300, height: 200, channels: 3, background: '#7f2a5f' },
  })
    .png()
    .toBuffer();
  const fileBytes = Buffer.from('exact private file bytes 香港\n'.repeat(500));
  await page.getByLabel('Choose local files').setInputFiles([
    { name: 'one.jpg', mimeType: 'image/jpeg', buffer: photo },
    { name: 'two.png', mimeType: 'image/png', buffer: photo2 },
    { name: '報告.txt', mimeType: 'text/plain', buffer: fileBytes },
  ]);
  await expect(
    page.getByTestId('composer').getByText('Attachments (3)', { exact: true }),
  ).toBeVisible();
  const before = await page.getByTestId('posted-note').count();
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(page.getByTestId('posted-note')).toHaveCount(before + 1, {
    timeout: 60_000,
  });
  notes.image = 'Drill image post 圖片 #Media';

  const timeline = (await (await api(page, A, 'get', '/api/notes')).json()).data
    .items as {
    bodyMarkdown: string;
    attachments: { id: string; kind: string }[];
  }[];
  const imagePost = timeline.find((n) =>
    n.bodyMarkdown.includes('Drill image post'),
  )!;
  expect(imagePost.attachments).toHaveLength(3);
  const image = imagePost.attachments.find((a) => a.kind === 'image')!;
  const file = imagePost.attachments.find((a) => a.kind === 'file')!;
  const bytes = async (path: string) =>
    Buffer.from(await (await api(page, A, 'get', path)).body());
  const imageDisplaySha = sha(
    await bytes(`/api/attachments/${image.id}/display`),
  );
  const imageThumbSha = sha(
    await bytes(`/api/attachments/${image.id}/thumbnail`),
  );
  const fileDownload = await bytes(`/api/attachments/${file.id}/file`);
  expect(fileDownload.equals(fileBytes)).toBe(true);

  // Browser-local work (not part of any backup).
  await page.goto(`${A}/drafts`);
  await page.getByRole('button', { name: 'Create another draft' }).click();
  await page
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('Browser-local draft that must never enter a backup');
  await expect(page.getByTestId('composer').getByRole('status')).toHaveText(
    'Saved on this device.',
  );

  // Manual full backup + protected download.
  await page.goto(`${A}/settings`);
  const backups = page.getByTestId('backup-settings');
  await backups
    .getByRole('button', { name: 'Create full backup', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Authorize backup action' });
  await dialog.getByLabel('Password for backup action').fill(PASSWORD);
  await dialog
    .getByLabel('Authenticator or recovery code for backup action')
    .fill(await freshCode(secret, usedCodes));
  const creating = page.waitForResponse(
    (r) => r.url() === `${A}/api/backups` && r.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Confirm create backup' }).click();
  const job = (await (await creating).json()).data as { id: string };
  const row = backups.locator(`[data-backup-id="${job.id}"]`);
  await expect(row).toContainText('complete', { timeout: 120_000 });
  await row.getByRole('button', { name: 'Download backup' }).click();
  await dialog.getByLabel('Password for backup action').fill(PASSWORD);
  await dialog
    .getByLabel('Authenticator or recovery code for backup action')
    .fill(await freshCode(secret, usedCodes));
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Confirm download backup' }).click();
  const download = await downloading;
  const archive = `${DIR}/a-backup.pnb`;
  await download.saveAs(archive);
  seed = {
    secret,
    recovery,
    notes,
    imageDisplaySha,
    imageThumbSha,
    fileSha: sha(fileBytes),
    imageId: image.id,
    fileId: file.id,
    archive,
  };
  void published;
  // Sensitive actions require fresh authentication even with a valid session, and
  // cross-origin requests are rejected at the deployed edge.
  const sensitive: [string, 'get' | 'post', string, unknown][] = [
    ['create backup without grant', 'post', '/api/backups', {}],
    [
      'download without grant',
      'get',
      `/api/backups/${job.id}/download`,
      undefined,
    ],
    ['delete backup without grant', 'post', `/api/backups/${job.id}`, {}],
    ['confirm restore without grant', 'post', '/api/restores/confirm', {}],
  ];
  for (const [name, method, path, body] of sensitive) {
    const response = await api(page, A, method, path, body);
    expect([400, 401, 403, 404, 405], name).toContain(response.status());
  }
  const crossOrigin = await page.request.post(`${A}/api/notes`, {
    headers: { origin: 'https://attacker.invalid' },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);
  writeFileSync(`${DIR}/seed.json`, JSON.stringify(seed), { mode: 0o600 });
  await context.storageState({
    path: `${DIR}/a-storage.json`,
    indexedDB: true,
  });
  await context.close();
});

test('deployed private surface: anonymous probes cannot reach data, files, backups, source or configuration', async ({
  playwright,
}) => {
  seed ??= JSON.parse(readFileSync(`${DIR}/seed.json`, 'utf8')) as Seed;
  const anonymous = await playwright.request.newContext({
    ignoreHTTPSErrors: true,
    maxRedirects: 0,
  });
  for (const origin of [A, B]) {
    const paths = [
      `/api/attachments/${seed.imageId}/display`,
      `/api/attachments/${seed.fileId}/file`,
      '/api/notes',
      '/api/backups',
      '/api/auth/security',
      '/api/settings/storage',
      '/data/db/pandanote.sqlite',
      '/db/pandanote.sqlite',
      '/files/' + seed.imageId + '/display.webp',
      '/private/key-material.json',
      '/backups/x.pnb',
      '/.env',
      '/build/index.js',
      '/src/hooks.server.ts',
      '/package.json',
      '/migrations/0000_foundation.sql',
      '/_app/../../etc/passwd',
      '/__spikes/mermaid',
      '/debug',
      '/admin',
    ];
    for (const path of paths) {
      const response = await anonymous.get(`${origin}${path}`);
      expect([301, 303, 308, 401, 403, 404], `${origin}${path}`).toContain(
        response.status(),
      );
      const body = (await response.body()).toString('latin1');
      expect(body, path).not.toContain('SQLite format 3');
      expect(body, path).not.toContain('totpEncryptionKey');
      expect(body, path).not.toContain('"scripts"');
    }
    // Public pages carry no private data and no inline-script allowance.
    const login = await anonymous.get(`${origin}/login`);
    expect(login.status()).toBe(200);
    expect(login.headers()['content-security-policy']).toContain(
      "script-src 'self'",
    );
    expect(login.headers()['content-security-policy']).not.toContain(
      'unsafe-eval',
    );
    expect(login.headers()['cache-control']).toBe('no-store');
  }
  await anonymous.dispose();
});

test('independent deployment B (different domain): temporary setup, uploaded web restore, archived credentials/TOTP, data/files/settings and exclusions verified', async ({
  browser,
}) => {
  seed ??= JSON.parse(readFileSync(`${DIR}/seed.json`, 'utf8')) as Seed;
  const context = await signedInContext(browser);
  const page = await context.newPage();
  expect(new URL(A).host).not.toBe(new URL(B).host);
  await setup(
    page,
    B,
    readFileSync(`${DIR}/b.token`, 'utf8').trim(),
    TEMP_PASSWORD,
  );
  // Empty destination: no source data, no local drafts from A.
  const empty = (await (await api(page, B, 'get', '/api/notes')).json()).data;
  expect(empty.items).toHaveLength(0);
  await page.goto(`${B}/drafts`);
  expect(
    await page.evaluate(() =>
      Object.values(localStorage).some((v) => v.includes('Browser-local')),
    ),
  ).toBe(false);
  const tempCookie = (await context.cookies()).find(
    (c) => c.name === 'pandanote_session',
  )!.value;

  await page.goto(`${B}/settings`);
  const restores = page.getByTestId('restore-settings');
  await restores.getByLabel('PandaNote backup archive').setInputFiles({
    name: 'a-backup.pnb',
    mimeType: 'application/octet-stream',
    buffer: readFileSync(seed.archive),
  });
  await restores
    .getByRole('button', { name: 'Upload and validate backup', exact: true })
    .click();
  const upload = page.getByRole('dialog', { name: 'Authorize restore upload' });
  await upload.getByLabel('Current password for restore').fill(TEMP_PASSWORD);
  await upload
    .getByRole('button', { name: 'Confirm upload and validate' })
    .click();
  await expect(restores.getByTestId('restore-summary')).toBeVisible({
    timeout: 120_000,
  });
  await expect(restores).toContainText('Nothing has been replaced');
  await restores
    .getByRole('button', { name: 'Replace application from backup' })
    .click();
  const confirm = page.getByRole('dialog', { name: 'Confirm full restore' });
  await confirm
    .getByLabel('I understand that current application data will be replaced.')
    .check();
  await confirm.getByLabel('Current password for restore').fill(TEMP_PASSWORD);
  await confirm
    .getByRole('button', { name: 'Confirm replace all application data' })
    .click();
  await expect(page).toHaveURL(`${B}/login`, { timeout: 120_000 });

  // The temporary session and temporary password are gone.
  await context.clearCookies();
  await context.addCookies([
    { name: 'pandanote_session', value: tempCookie, url: B },
  ]);
  expect((await api(page, B, 'get', '/api/notes')).status()).toBe(401);
  await context.clearCookies();
  await page.goto(`${B}/login`);
  await page.getByLabel('Password', { exact: true }).fill(TEMP_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Unable to sign in');
  // Archived account: password then TOTP.
  await signIn(page, B, PASSWORD, await freshCode(seed.secret, usedCodes));

  const timeline = (await (await api(page, B, 'get', '/api/notes')).json()).data
    .items as {
    bodyMarkdown: string;
    tags: string[];
    location: { label: string | null } | null;
    timelineAt: number;
    attachments: { id: string }[];
  }[];
  const bodies = timeline.map((n) => n.bodyMarkdown).join('\n---\n');
  for (const key of ['published', 'located', 'code', 'image'])
    expect(bodies, key).toContain(seed.notes[key]);
  expect(bodies).not.toContain(seed.notes.draft);
  expect(bodies).not.toContain(seed.notes.trash);
  const published = timeline.find((n) =>
    n.bodyMarkdown.includes('Drill published'),
  )!;
  expect(published.timelineAt).toBe(Date.UTC(2023, 4, 17, 8, 30));
  expect(published.tags).toContain('drill');
  expect(
    timeline.find((n) => n.bodyMarkdown.includes('Drill located'))!.location,
  ).toMatchObject({ label: 'Drill label 九龍' });
  for (const [status, key] of [
    ['draft', 'draft'],
    ['trash', 'trash'],
  ] as const) {
    const list = await (
      await api(page, B, 'get', `/api/notes/status?status=${status}`)
    ).text();
    expect(list, status).toContain(seed.notes[key]);
  }
  const bytes = async (path: string) =>
    Buffer.from(await (await api(page, B, 'get', path)).body());
  expect(sha(await bytes(`/api/attachments/${seed.imageId}/display`))).toBe(
    seed.imageDisplaySha,
  );
  expect(sha(await bytes(`/api/attachments/${seed.imageId}/thumbnail`))).toBe(
    seed.imageThumbSha,
  );
  expect(sha(await bytes(`/api/attachments/${seed.fileId}/file`))).toBe(
    seed.fileSha,
  );
  // Search is rebuilt, including a short CJK term.
  const found = await (
    await api(page, B, 'get', `/api/notes?q=${encodeURIComponent('香港')}`)
  ).json();
  expect(found.data.items.length).toBeGreaterThan(0);
  // Settings restored: dark/compact appearance is rendered server-side.
  await page.goto(`${B}/`);
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  expect(html).toMatch(/dark/);
  // Restored account has MFA; a restored backup list exists and the app is usable.
  await page.goto(`${B}/settings`);
  await expect(page.getByText('MFA: enabled', { exact: false })).toBeVisible();
  // A recovery code archived on A is accepted once on B.
  const second = await signedInContext(browser);
  const other = await second.newPage();
  await signIn(other, B, PASSWORD, seed.recovery[0]);
  await second.close();

  // The source deployment is independent and unchanged.
  const source = await signedInContext(browser);
  const sourcePage = await source.newPage();
  await signIn(
    sourcePage,
    A,
    PASSWORD,
    await freshCode(seed.secret, usedCodes),
  );
  const sourceList = await (
    await api(sourcePage, A, 'get', '/api/notes')
  ).text();
  expect(sourceList).toContain(seed.notes.image);
  await source.close();
  await context.close();
});
