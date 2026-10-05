import { randomUUID, createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { browserSession } from '../helpers/browser-session.ts';
import type { NoteSnapshot } from '../../src/lib/shared/domain.ts';
import type { LocalDraft } from '../../src/lib/client/drafts/model.ts';
import { canonicalNoteMutation } from '../../src/lib/shared/notes.ts';
const origin = 'http://127.0.0.1:4173';
async function auth(page: Page) {
  const cookies = await browserSession(page);
  return {
    origin,
    cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
  };
}
async function get(page: Page, id: string): Promise<NoteSnapshot> {
  const response = await page.request.get(`/api/notes/${id}`, {
    headers: await auth(page),
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}
async function create(
  page: Page,
  text: string,
  media = false,
  timelineAt = Date.UTC(2020, 0, 3),
) {
  const headers = await auth(page);
  const files = media
    ? [
        {
          id: randomUUID(),
          filename: 'existing.txt',
          bytes: Buffer.from('existing server bytes 香港'),
        },
        {
          id: randomUUID(),
          filename: 'existing.png',
          bytes: await sharp({
            create: { width: 40, height: 20, channels: 3, background: 'green' },
          })
            .png()
            .toBuffer(),
        },
      ]
    : [];
  const command = {
    action: 'create' as const,
    mutationId: randomUUID(),
    content: {
      bodyMarkdown:
        text + (media ? `\n\n![existing](attachment:${files[1].id})` : ''),
      timelineAt,
      location: {
        latitude: 1,
        longitude: 2,
        accuracy: null,
        label: 'Synthetic',
      },
      attachmentIds: files.map((f) => f.id),
    },
  };
  if (files.length) {
    const init = await page.request.post('/api/uploads', {
      headers,
      data: {
        mutationId: command.mutationId,
        requestDigest: createHash('sha256')
          .update(canonicalNoteMutation(command))
          .digest('hex'),
        items: files.map((f) => ({
          id: f.id,
          filename: f.filename,
          incomingBytes: f.bytes.length,
          incomingDigest: createHash('sha256').update(f.bytes).digest('hex'),
        })),
      },
    });
    expect(init.status()).toBe(200);
    const batch = (await init.json()).data.batch.id;
    for (const f of files)
      expect(
        (
          await page.request.put(`/api/uploads/${batch}/${f.id}`, {
            headers,
            data: f.bytes,
          })
        ).status(),
      ).toBe(200);
  }
  const response = await page.request.post('/api/notes', {
    headers,
    data: command,
  });
  expect(response.status()).toBe(200);
  return get(page, (await response.json()).data.noteId);
}
async function action(
  page: Page,
  note: NoteSnapshot,
  name: 'move-to-draft' | 'trash' | 'restore',
) {
  const response = await page.request.post(`/api/notes/${note.id}/actions`, {
    headers: await auth(page),
    data: {
      action: name,
      mutationId: randomUUID(),
      noteId: note.id,
      expectedRevision: note.revision,
    },
  });
  expect(response.status()).toBe(200);
  return get(page, note.id);
}
async function records(page: Page): Promise<LocalDraft[]> {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.includes(':record:'))
      .map((k) => JSON.parse(localStorage.getItem(k)!))
      .filter((d) => !d.deleted),
  );
}
const row = (page: Page, id: string) => page.locator(`[data-note-id="${id}"]`);

test('server draft has device-only recovery overlay; another device sees saved files/text, reload and Post preserve timeline/location', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(60000);
  const tag = `s13draft${randomUUID().slice(0, 8)}`;
  const base = await create(page, `last server version #${tag}`, true);
  await page.goto(`/notes/${base.id}`);
  await page
    .getByRole('button', { name: 'Move to Drafts', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm move', exact: true }).click();
  await expect(page.getByTestId('note-detail')).toContainText('draft');
  await page
    .getByRole('button', { name: 'Close Note detail', exact: true })
    .click();
  await page.goto('/drafts');
  await expect(row(page, base.id)).toContainText('last server version');
  const premature: string[] = [];
  page.on('request', (request) => {
    if (
      ['POST', 'PATCH', 'PUT'].includes(request.method()) &&
      /\/api\/(notes|uploads)/.test(request.url())
    )
      premature.push(request.url());
  });
  await row(page, base.id)
    .getByRole('button', { name: 'Edit server draft' })
    .click();
  const editor = page.getByRole('textbox', { name: 'Note text', exact: true });
  const edited = `local unfinished #${tag}\n\n![existing](attachment:${base.attachmentIds[1]})`;
  await editor.fill(edited);
  await page.getByLabel('Choose local files').setInputFiles({
    name: 'new-local.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('new device-only bytes 図書館'),
  });
  await expect
    .poll(
      async () =>
        (await records(page)).find((d) => d.serverBase?.noteId === base.id)
          ?.attachments.length,
    )
    .toBe(3);
  expect((await get(page, base.id)).bodyMarkdown).toBe(base.bodyMarkdown);
  const otherContext = await browser.newContext();
  await otherContext.addCookies(await page.context().cookies());
  const other = await otherContext.newPage();
  await other.goto('/drafts');
  await expect(row(other, base.id)).toContainText('last server version');
  await expect(other.getByTestId('local-draft')).toHaveCount(0);
  await row(other, base.id)
    .getByRole('button', { name: 'Edit server draft' })
    .click();
  await expect(
    other.getByRole('textbox', { name: 'Note text', exact: true }),
  ).toHaveValue(base.bodyMarkdown);
  expect((await records(other))[0].attachments).toHaveLength(2);
  await otherContext.close();
  await page.reload();
  await row(page, base.id)
    .getByRole('button', { name: 'Resume local recovery' })
    .click();
  await expect(editor).toHaveValue(edited);
  await expect(
    page
      .getByTestId('composer')
      .getByRole('button', { name: 'Post', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Save draft', exact: true }),
  ).toHaveCount(0);
  expect(premature).toEqual([]);
  await page.screenshot({ path: info.outputPath('drafts-desktop.png') });
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(
    page.getByTestId('composer').getByText('Saved on server.', { exact: true }),
  ).toBeVisible();
  await expect(row(page, base.id)).toHaveCount(0);
  const published = await get(page, base.id);
  expect(published).toMatchObject({
    status: 'published',
    timelineAt: base.timelineAt,
    location: base.location,
    bodyMarkdown: edited,
  });
  expect(published.attachmentIds).toHaveLength(3);
  expect(
    (await records(page)).filter((d) => d.serverBase?.noteId === base.id),
  ).toHaveLength(0);
  await page.goto(`/?q=${tag}`);
  await expect(row(page, base.id)).toBeVisible();
});

test('Trash restores published and draft status/files; private detail and mobile confirmed permanent deletion', async ({
  page,
}, info) => {
  const published = await create(page, `trash published ${randomUUID()}`, true);
  const draft = await action(
    page,
    await create(page, `trash draft ${randomUUID()}`),
    'move-to-draft',
  );
  const trashPublished = await action(page, published, 'trash');
  const trashDraft = await action(page, draft, 'trash');
  await page.goto('/trash');
  for (const note of [trashPublished, trashDraft]) {
    await expect(row(page, note.id)).toContainText(
      `restores to ${note.priorStatus}`,
    );
    await row(page, note.id)
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await page.getByRole('button', { name: 'Confirm restore' }).click();
    await expect(row(page, note.id)).toHaveCount(0);
    const restored = await get(page, note.id);
    expect(restored).toMatchObject({
      status: note.priorStatus,
      timelineAt: note.timelineAt,
      attachmentIds: note.attachmentIds,
      bodyMarkdown: note.bodyMarkdown,
      location: note.location,
    });
  }
  await page.goto('/drafts');
  await expect(row(page, draft.id)).toBeVisible();
  await row(page, draft.id)
    .getByRole('button', { name: 'Move to Trash' })
    .click();
  await page.getByRole('button', { name: 'Confirm move' }).click();
  await expect(row(page, draft.id)).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/trash');
  await row(page, draft.id)
    .getByRole('link', { name: 'Open trashed note' })
    .click();
  await expect(page.getByTestId('note-detail')).toContainText(
    'trash (was draft)',
  );
  await expect(
    page.getByRole('button', { name: 'Edit note', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Close Note detail', exact: true })
    .click();
  await row(page, draft.id)
    .getByRole('button', { name: 'Permanently delete' })
    .click();
  expect((await get(page, draft.id)).status).toBe('trash');
  await page.screenshot({
    path: info.outputPath('trash-mobile-confirmation.png'),
  });
  await page.getByRole('button', { name: 'Confirm permanent delete' }).click();
  await expect(row(page, draft.id)).toHaveCount(0);
  expect(
    (
      await page.request.get(`/api/notes/${draft.id}`, {
        headers: await auth(page),
      })
    ).status(),
  ).toBe(404);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const file = published.attachments!.find((a) => a.kind === 'file')!;
  const downloaded = await page.request.get(
    `/api/attachments/${file.id}/file`,
    { headers: await auth(page) },
  );
  expect((await downloaded.body()).toString()).toBe(
    'existing server bytes 香港',
  );
});

test('permanent-delete response loss retains durable exact retry across reload and resolves receipt after note disappears', async ({
  page,
}) => {
  const note = await action(
    page,
    await create(page, `lost delete ${randomUUID()}`),
    'trash',
  );
  await page.goto('/trash');
  const commands: unknown[] = [];
  await page.route(`**/api/notes/${note.id}/actions`, async (route) => {
    commands.push(route.request().postDataJSON());
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await row(page, note.id)
    .getByRole('button', { name: 'Permanently delete' })
    .click();
  await page.getByRole('button', { name: 'Confirm permanent delete' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Permanently delete note?' })
      .getByRole('alert'),
  ).toContainText('retry');
  await page.unrouteAll({ behavior: 'wait' });
  await page
    .getByRole('button', {
      name: 'Close Permanently delete note?',
      exact: true,
    })
    .click();
  await page.reload();
  await expect(row(page, note.id)).toHaveCount(0);
  await page
    .getByRole('region', { name: 'Unconfirmed note actions' })
    .getByRole('button')
    .click();
  await page.route(`**/api/notes/${note.id}/actions`, async (route) => {
    commands.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.getByRole('button', { name: 'Retry same action' }).click();
  await expect(
    page.getByRole('region', { name: 'Unconfirmed note actions' }),
  ).toHaveCount(0);
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
});

test('stale Trash revisions conflict without force; refresh and a new explicit restore preserve local recovery copies', async ({
  page,
}) => {
  const base = await create(page, `stale status ${randomUUID()}`);
  await page.goto(`/notes/${base.id}`);
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Note text', exact: true })
    .fill('losing local recovery kept');
  await expect
    .poll(async () =>
      (await records(page)).some(
        (d) => d.bodyMarkdown === 'losing local recovery kept',
      ),
    )
    .toBe(true);
  const trash = await action(page, base, 'trash');
  await page.goto('/trash');
  const restored = await action(page, trash, 'restore');
  await row(page, base.id)
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Restore note?' }).getByRole('alert'),
  ).toContainText('changed');
  expect((await get(page, base.id)).revision).toBe(restored.revision);
  await page.getByRole('button', { name: 'Refresh server version' }).click();
  await expect(row(page, base.id)).toHaveCount(0);
  expect(
    (await records(page)).some(
      (d) => d.bodyMarkdown === 'losing local recovery kept',
    ),
  ).toBe(true);
});

test('private bounded SSR status lists and older-page failure/retry', async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await auth(page);
  const ids: string[] = [];
  for (let n = 0; n < 33; n++)
    ids.push(
      (
        await action(
          page,
          await create(page, `s13paging ${n} ${randomUUID()}`),
          'move-to-draft',
        )
      ).id,
    );
  await page.goto('/drafts');
  await expect(page.getByTestId('server-draft')).toHaveCount(30);
  await page.route('**/api/notes/status?**', (route) => route.abort('failed'));
  await page.getByRole('button', { name: 'Load older entries' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Older entries' }),
  ).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
  await page.getByRole('button', { name: 'Retry older entries' }).click();
  await expect
    .poll(() => page.getByTestId('server-draft').count())
    .toBeGreaterThan(30);
  const displayed = await page
    .getByTestId('server-draft')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-note-id')));
  expect(new Set(displayed).size).toBe(displayed.length);
  for (const id of ids) expect(displayed).toContain(id);
  const last = page.getByTestId('server-draft').last();
  await last.getByRole('button', { name: 'Move to Trash' }).click();
  await page.getByRole('button', { name: 'Confirm move', exact: true }).click();
  await expect(page.getByTestId('server-draft')).toHaveCount(
    displayed.length - 1,
  );
  const noJS = await browser.newContext({ javaScriptEnabled: false });
  await noJS.addCookies(await page.context().cookies());
  const server = await noJS.newPage();
  await server.goto('/drafts');
  await expect(server.getByTestId('server-draft')).toHaveCount(30);
  await noJS.close();
  const anonymous = await browser.newContext();
  const response = await anonymous.request.get(
    `${origin}/api/notes/status?status=draft`,
  );
  expect(response.status()).toBe(401);
  await anonymous.close();
});

test('multiple losing recoveries remain distinguishable; server entry resumes matching active recovery without deleting older edits', async ({
  page,
}) => {
  const base = await action(
    page,
    await create(
      page,
      `multiple recovery ${randomUUID()}`,
      false,
      Date.now() - 1000,
    ),
    'move-to-draft',
  );
  await page.goto('/drafts');
  await row(page, base.id)
    .getByRole('button', { name: 'Edit server draft' })
    .click();
  const editor = page.getByRole('textbox', { name: 'Note text', exact: true });
  await editor.fill('older losing recovery');
  await expect
    .poll(async () =>
      (await records(page)).some(
        (d) => d.bodyMarkdown === 'older losing recovery',
      ),
    )
    .toBe(true);
  await action(page, await action(page, base, 'trash'), 'restore');
  await row(page, base.id)
    .getByRole('button', { name: 'Resume local recovery' })
    .click();
  await page
    .getByRole('button', { name: 'Load server version', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm load server' }).click();
  await expect(editor).toHaveValue(base.bodyMarkdown);
  await editor.fill('newer matching recovery');
  await expect
    .poll(
      async () =>
        (await records(page)).filter((d) => d.serverBase?.noteId === base.id)
          .length,
    )
    .toBe(2);
  await expect(row(page, base.id)).toContainText(
    '2 device-only recovery copies',
  );
  const locals = page.getByTestId('local-draft');
  await expect(
    locals.filter({ hasText: 'older losing recovery' }),
  ).toContainText('base revision 2');
  await expect(
    locals.filter({ hasText: 'newer matching recovery' }),
  ).toContainText('base revision 4');
  await row(page, base.id)
    .getByRole('button', { name: 'Resume local recovery' })
    .click();
  await expect(editor).toHaveValue('newer matching recovery');
  expect(
    (await records(page)).filter((d) => d.serverBase?.noteId === base.id),
  ).toHaveLength(2);
});

test('Move to Drafts removes published search/day counts and Back never resurrects an old timeline card', async ({
  page,
}) => {
  const tag = `s13history${randomUUID().slice(0, 8)}`;
  const base = await create(page, `lifecycle history #${tag}`);
  const before = await page.request.get('/api/calendar?month=2020-01', {
    headers: await auth(page),
  });
  const count = (await before.json()).data.counts[2];
  await page.goto(`/?tag=${tag}&date=2020-01-03`);
  await expect(row(page, base.id)).toBeVisible();
  await row(page, base.id)
    .getByRole('button', { name: 'Note actions' })
    .click();
  await page
    .getByRole('button', { name: 'Move to Drafts', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm move', exact: true }).click();
  await expect(row(page, base.id)).toHaveCount(0);
  await expect(
    page.getByRole('link', {
      name: `2020-01-03: ${count - 1} published notes, selected; clear day filter`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Drafts', exact: true }).click();
  await expect(page).toHaveURL(/\/drafts$/);
  await expect(
    page.getByRole('button', { name: 'Refresh server drafts', exact: true }),
  ).toBeEnabled();
  while (
    !(await row(page, base.id).count()) &&
    (await page
      .getByRole('button', { name: 'Load older entries', exact: true })
      .count())
  ) {
    const response = page.waitForResponse((response) =>
      response.url().includes('/api/notes/status?'),
    );
    await page
      .getByRole('button', { name: 'Load older entries', exact: true })
      .click();
    await response;
    await expect(
      page.getByRole('button', { name: 'Loading…', exact: true }),
    ).toHaveCount(0);
  }
  await expect(row(page, base.id)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`tag=${tag}`));
  await expect(row(page, base.id)).toHaveCount(0);
  const response = await page.request.get(`/api/notes?q=${tag}`, {
    headers: await auth(page),
  });
  expect((await response.json()).data.items).toHaveLength(0);
});

test('retry-storage quota blocks lifecycle networking instead of pretending an action is durable', async ({
  page,
}) => {
  const note = await action(
    page,
    await create(page, `quota ${randomUUID()}`),
    'trash',
  );
  await page.goto('/trash');
  await row(page, note.id)
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  const commands: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith(`/api/notes/${note.id}/actions`))
      commands.push(request.method());
  });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('pandanote:lifecycle:'))
        throw new DOMException('synthetic quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Restore note?' }).getByRole('alert'),
  ).toContainText('action was not sent');
  expect(commands).toEqual([]);
  expect((await get(page, note.id)).status).toBe('trash');
  await page
    .getByRole('button', { name: 'Close Restore note?', exact: true })
    .click();
  await page.reload();
  await row(page, note.id)
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm restore' }).click();
  await expect(row(page, note.id)).toHaveCount(0);
});
