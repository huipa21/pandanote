import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { expect, test } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';
import type {
  InitializeBatchResult,
  UploadBatchDto,
} from '../../src/lib/shared/attachments.ts';

const origin = 'http://127.0.0.1:4173';
test('private resumable uploads, processed variants, safe active-file download and real Origin/session gates', async ({
  page,
  browser,
}) => {
  await browserSession(page);
  const cookie = (await page.context().cookies()).find(
    (entry) => entry.name === 'pandanote_session',
  )!;
  const auth = { cookie: `${cookie.name}=${cookie.value}` };
  const image = await sharp({
    create: { width: 64, height: 32, channels: 3, background: 'green' },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  // Adapter's old 512 KiB default must not silently break legitimate file uploads.
  const html = Buffer.concat([
    Buffer.from(
      '<!doctype html><script>window.__attachmentExecuted=true</script>',
    ),
    Buffer.alloc(600 * 1024, 32),
  ]);
  const inputs = [image, html, Buffer.alloc(0)];
  const value = {
    mutationId: randomUUID(),
    requestDigest: 'a'.repeat(64),
    items: inputs.map((input, i) => ({
      id: randomUUID(),
      filename:
        i === 0
          ? 'image-renamed.txt'
          : i === 1
            ? '../../香港";.html'
            : 'empty.txt',
      incomingBytes: input.length,
      incomingDigest: createHash('sha256').update(input).digest('hex'),
    })),
  };
  const initialize = await page.request.post('/api/uploads', {
    headers: { ...auth, origin },
    data: value,
  });
  expect(initialize.status(), await initialize.text()).toBe(200);
  const result = (await initialize.json()).data as InitializeBatchResult;
  expect(result.state).toBe('batch');
  if (result.state !== 'batch') throw new Error('Expected batch');
  const batch = result.batch;
  const imageUrl = `/api/attachments/${value.items[0].id}/display`;
  expect((await page.request.get(imageUrl, { headers: auth })).status()).toBe(
    404,
  );
  const foreign = await browser.newContext();
  try {
    for (const path of [
      imageUrl,
      `/api/attachments/${value.items[0].id}/thumbnail`,
      `/api/attachments/${value.items[1].id}/file`,
      `/api/uploads/${batch.id}`,
    ])
      expect((await foreign.request.get(`${origin}${path}`)).status()).toBe(
        401,
      );
    expect(
      (
        await foreign.request.post(`${origin}/api/uploads`, {
          headers: { origin },
          data: value,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await page.request.put(
          `/api/uploads/${batch.id}/${value.items[0].id}`,
          {
            headers: {
              ...auth,
              origin: 'https://attacker.invalid',
              'content-type': 'application/octet-stream',
            },
            data: image,
          },
        )
      ).status(),
    ).toBe(403);
    for (const [i, input] of inputs.entries()) {
      const upload = await page.request.put(
        `/api/uploads/${batch.id}/${value.items[i].id}`,
        {
          headers: {
            ...auth,
            origin,
            'content-type': 'application/octet-stream',
          },
          data: input,
        },
      );
      expect(upload.status(), await upload.text()).toBe(200);
    }
    const resume = await page.request.post('/api/uploads', {
      headers: { ...auth, origin },
      data: value,
    });
    expect((await resume.json()).data.batch.id).toBe(batch.id);
    const status = await page.request.get(`/api/uploads/${batch.id}`, {
      headers: auth,
    });
    const ready = (await status.json()).data as UploadBatchDto;
    expect(ready.attachments.every((item) => item.readiness === 'ready')).toBe(
      true,
    );
    expect(
      ready.attachments.find((item) => item.id === value.items[0].id),
    ).toMatchObject({ kind: 'image', width: 32, height: 64 });
    const empty = await page.request.get(
      `/api/attachments/${value.items[2].id}/file`,
      { headers: auth },
    );
    expect(empty.status()).toBe(200);
    expect(await empty.body()).toHaveLength(0);
    const output = await page.request.get(imageUrl, { headers: auth });
    expect(output.headers()['content-type']).toBe('image/webp');
    expect(output.headers()['cache-control']).toContain('no-store');
    expect((await sharp(await output.body()).metadata()).exif).toBeUndefined();
    const thumbnail = await page.request.get(
      `/api/attachments/${value.items[0].id}/thumbnail`,
      { headers: auth },
    );
    expect(thumbnail.status()).toBe(200);
    expect(
      (
        await page.request.get(`/api/attachments/${value.items[0].id}/file`, {
          headers: auth,
        })
      ).status(),
    ).toBe(404);
    const duplicate = await page.request.put(
      `/api/uploads/${batch.id}/${value.items[0].id}`,
      { headers: { ...auth, origin }, data: image },
    );
    expect(duplicate.status()).toBe(200);
    const mismatch = await page.request.put(
      `/api/uploads/${batch.id}/${value.items[0].id}`,
      { headers: { ...auth, origin }, data: Buffer.alloc(image.length) },
    );
    expect(mismatch.status()).toBe(409);
    const head = await page.request.head(imageUrl, { headers: auth });
    expect(head.status()).toBe(200);
    expect(await head.body()).toHaveLength(0);
    expect(
      (
        await page.request.get('/api/attachments/not-a-uuid/display', {
          headers: auth,
        })
      ).status(),
    ).toBe(400);
    // Delay actual entry modules: an initial compose/file action must not look
    // clickable and then vanish before hydration attaches its handlers.
    const entryPattern = '**/_app/immutable/entry/*.js';
    let resumeModules!: () => void;
    const modules = new Promise<void>((resolve) => {
      resumeModules = resolve;
    });
    await page.route(entryPattern, async (route) => {
      await modules;
      await route.continue();
    });
    try {
      await page.goto('/drafts', { waitUntil: 'commit' });
      await expect(
        page.getByRole('button', { name: 'Write a note…' }),
      ).toBeDisabled();
      await expect(page.getByLabel('Choose local files')).toBeDisabled();
    } finally {
      resumeModules();
      await page.unrouteAll({ behavior: 'wait' });
    }
    await page.getByRole('button', { name: 'Create another draft' }).click();
    const downloadEvent = page.waitForEvent('download');
    await page.evaluate((path) => {
      const a = document.createElement('a');
      a.href = path;
      document.body.append(a);
      a.click();
      a.remove();
    }, `/api/attachments/${value.items[1].id}/file`);
    const download = await downloadEvent;
    expect(await download.failure()).toBeNull();
    expect(readFileSync((await download.path())!)).toEqual(html);
    expect(download.suggestedFilename()).toContain('香港');
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __attachmentExecuted?: boolean })
            .__attachmentExecuted,
      ),
    ).toBeUndefined();
    // Local draft selection remains device-only even though upload routes now exist.
    const premature: string[] = [];
    page.on('request', (r) => {
      if (/\/api\/uploads|\/api\/notes/.test(r.url())) premature.push(r.url());
    });
    await page.getByLabel('Choose local files').setInputFiles({
      name: 'new-local.png',
      mimeType: 'image/png',
      buffer: image,
    });
    await expect(
      page.getByRole('button', { name: 'Add files' }).first(),
    ).toBeEnabled();
    expect(premature).toEqual([]);
  } finally {
    await foreign.close();
  }
});
