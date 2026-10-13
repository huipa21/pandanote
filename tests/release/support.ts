import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { generateSync } from 'otplib';
import { expect, type BrowserContext, type Page } from '@playwright/test';

// Shared S18 drill helpers. All names/passwords are synthetic.
export const A = process.env.DRILL_A ?? 'https://a.localtest.me:8443';
export const B = process.env.DRILL_B ?? 'https://b.localtest.me:9443';
export const DIR = process.env.DRILL_DIR ?? '.drill';
export const USERNAME = 'drill.owner';
export const PASSWORD = 'drill-source-password 密碼 ✓ 1';
export const TEMP_PASSWORD = 'drill-temporary-destination-pw 1';
export const sha = (bytes: Buffer | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
mkdirSync(DIR, { recursive: true });

// Persisted so a later process (restart phase) never replays a consumed window.
const usedFile = `${DIR}/used-codes.json`;
export const usedCodes = new Set<string>(
  existsSync(usedFile)
    ? (JSON.parse(readFileSync(usedFile, 'utf8')) as string[])
    : [],
);
/** TOTP codes are single-use per window: wait for a code not yet consumed. */
export async function freshCode(
  secret: string,
  used: Set<string>,
): Promise<string> {
  for (let i = 0; i < 80; i++) {
    const code = generateSync({ secret });
    if (!used.has(code)) {
      used.add(code);
      writeFileSync(usedFile, JSON.stringify([...used]), { mode: 0o600 });
      return code;
    }
    await delay(500);
  }
  throw new Error('No unused TOTP window became available');
}

export async function api(
  page: Page,
  origin: string,
  method: 'get' | 'post' | 'patch',
  path: string,
  data?: unknown,
) {
  const response = await page.request[method](`${origin}${path}`, {
    headers: { origin },
    ...(data === undefined ? {} : { data }),
  });
  return response;
}
export async function mutate(
  page: Page,
  origin: string,
  body: string,
  extra: Record<string, unknown> = {},
) {
  const response = await api(page, origin, 'post', '/api/notes', {
    action: 'create',
    mutationId: crypto.randomUUID(),
    content: {
      bodyMarkdown: body,
      timelineAt: null,
      attachmentIds: [],
      ...extra,
    },
  });
  expect(response.status(), body).toBe(200);
  return (await response.json()).data as { noteId: string; revision: number };
}
export async function action(
  page: Page,
  origin: string,
  noteId: string,
  revision: number,
  name: string,
) {
  const response = await api(
    page,
    origin,
    'post',
    `/api/notes/${noteId}/actions`,
    {
      action: name,
      noteId,
      mutationId: crypto.randomUUID(),
      expectedRevision: revision,
    },
  );
  expect(response.status(), name).toBe(200);
}
export async function setup(
  page: Page,
  origin: string,
  pw: string,
  setupCode: string,
) {
  await page.goto(`${origin}/setup`);
  await page.getByLabel('Setup code', { exact: true }).fill(setupCode);
  await page.getByLabel('Username', { exact: true }).fill(USERNAME);
  await page.getByLabel('Email', { exact: true }).fill('drill@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByLabel('Re-enter password', { exact: true }).fill(pw);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(page).toHaveURL(`${origin}/setup/preferences`);
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
  await expect(page).toHaveURL(`${origin}/`, { timeout: 30_000 });
}
export async function signIn(
  page: Page,
  origin: string,
  pw: string,
  code?: string,
): Promise<void> {
  await page.goto(`${origin}/login`);
  await page.getByLabel('Username', { exact: true }).fill(USERNAME);
  await page.getByLabel('Password', { exact: true }).fill(pw);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (code) {
    await page.getByLabel('Authenticator or recovery code').fill(code);
    await page.getByRole('button', { name: 'Verify code' }).click();
  }
  await expect(page).toHaveURL(`${origin}/`, { timeout: 30_000 });
}
export async function signedInContext(
  browser: import('@playwright/test').Browser,
): Promise<BrowserContext> {
  return browser.newContext({ ignoreHTTPSErrors: true });
}
export interface Seed {
  secret: string;
  recovery: string[];
  notes: Record<string, string>;
  imageDisplaySha: string;
  imageThumbSha: string;
  fileSha: string;
  imageId: string;
  fileId: string;
  archive: string;
}
