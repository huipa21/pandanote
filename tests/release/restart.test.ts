import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  A,
  B,
  DIR,
  PASSWORD,
  api,
  freshCode,
  sha,
  signIn,
  signedInContext,
  usedCodes,
  type Seed,
} from './support.ts';

// S18 drill phase 2: runs after BOTH app containers were gracefully stopped and
// started again (ops/release-drill.sh). Data, files, settings and sessions live in
// the persistent volume; unsaved editor sessions are memory-only and not recovered.
const seed = JSON.parse(readFileSync(`${DIR}/seed.json`, 'utf8')) as Seed;

test('restarted source keeps its session with an empty editor; restarted restored deployment keeps archived data, files and settings', async ({
  browser,
}) => {
  const source = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: `${DIR}/a-storage.json`,
  });
  const sourcePage = await source.newPage();
  await sourcePage.goto(`${A}/`);
  await expect(sourcePage).toHaveURL(`${A}/`);
  await sourcePage.getByRole('button', { name: 'Write a note…' }).click();
  await expect(
    sourcePage.getByRole('textbox', { name: 'Note text' }),
  ).toHaveValue('');
  expect(
    await (await api(sourcePage, A, 'get', '/api/notes')).text(),
  ).toContain(seed.notes.image);
  await source.close();

  const context = await signedInContext(browser);
  const page = await context.newPage();
  await signIn(page, B, PASSWORD, await freshCode(seed.secret, usedCodes));
  const text = await (await api(page, B, 'get', '/api/notes')).text();
  for (const key of ['published', 'located', 'code', 'image'])
    expect(text, key).toContain(seed.notes[key]);
  const display = Buffer.from(
    await (
      await api(page, B, 'get', `/api/attachments/${seed.imageId}/display`)
    ).body(),
  );
  expect(sha(display)).toBe(seed.imageDisplaySha);
  await page.goto(`${B}/`);
  expect(await page.evaluate(() => document.documentElement.outerHTML)).toMatch(
    /dark/,
  );
  expect(await (await api(page, B, 'get', '/health')).json()).toEqual({
    status: 'ok',
  });
  await context.close();
});
