import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { authenticatedHeaders } from '../helpers/browser-session.ts';

test('Trash is the only status list; restore preserves dates and permanent delete is confirmed', async ({
  page,
}) => {
  const headers = await authenticatedHeaders(page);
  const result = await page.request.post('/api/notes', {
    headers,
    data: {
      action: 'create',
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: 'Trash lifecycle unique',
        timelineAt: Date.UTC(2020, 0, 3),
        location: null,
        attachmentIds: [],
      },
    },
  });
  expect(result.status()).toBe(200);
  const note = (await result.json()).data;
  const action = async (name: string, revision: number) => {
    const response = await page.request.post(
      `/api/notes/${note.noteId}/actions`,
      {
        headers,
        data: {
          action: name,
          noteId: note.noteId,
          expectedRevision: revision,
          mutationId: randomUUID(),
        },
      },
    );
    expect(response.status()).toBe(200);
  };
  expect(
    (
      await page.request.get('/api/notes/status?status=draft', { headers })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.post(`/api/notes/${note.noteId}/actions`, {
        headers,
        data: {
          action: 'move-to-draft',
          noteId: note.noteId,
          expectedRevision: 1,
          mutationId: randomUUID(),
        },
      })
    ).status(),
  ).toBe(400);
  await action('trash', 1);
  await page.goto('/trash');
  const row = page
    .getByTestId('trash-note')
    .filter({ hasText: 'Trash lifecycle unique' });
  const entry = row;
  // Rows have no per-note buttons: choose the note, then use the bulk icon.
  await expect(row.getByRole('button', { name: 'Restore' })).toHaveCount(0);
  await entry.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'Restore selected notes', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Restore notes?' }),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Restore notes?' })
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await expect(row).toHaveCount(0);
  const restored = (
    await (
      await page.request.get(`/api/notes/${note.noteId}`, { headers })
    ).json()
  ).data;
  expect(restored.timelineAt).toBe(Date.UTC(2020, 0, 3));
  expect(restored.status).toBe('published');
  await action('trash', restored.revision);
  await page.reload();
  await entry.getByRole('checkbox').check();
  await page
    .getByRole('button', {
      name: 'Delete selected notes permanently',
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Delete notes permanently?' }),
  ).toHaveCount(0);
  await expect(row).toHaveCount(1);
  await entry.getByRole('checkbox').check();
  await page
    .getByRole('button', {
      name: 'Delete selected notes permanently',
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog', { name: 'Delete notes permanently?' })
    .getByRole('button', { name: 'Delete permanently', exact: true })
    .click();
  await expect(row).toHaveCount(0);
  expect(
    (await page.request.get(`/api/notes/${note.noteId}`, { headers })).status(),
  ).toBe(404);
});

test('Trash search finds only trashed notes; Select all targets displayed notes', async ({
  page,
}) => {
  const headers = await authenticatedHeaders(page);
  const token = randomUUID().slice(0, 8);
  const make = async (body: string, trashIt: boolean) => {
    const created = await page.request.post('/api/notes', {
      headers,
      data: {
        action: 'create',
        mutationId: randomUUID(),
        content: {
          bodyMarkdown: body,
          timelineAt: Date.UTC(2021, 0, 3),
          location: null,
          attachmentIds: [],
        },
      },
    });
    expect(created.status()).toBe(200);
    const id = (await created.json()).data.noteId as string;
    if (trashIt)
      expect(
        (
          await page.request.post(`/api/notes/${id}/actions`, {
            headers,
            data: {
              action: 'trash',
              noteId: id,
              expectedRevision: 1,
              mutationId: randomUUID(),
            },
          })
        ).status(),
      ).toBe(200);
    return id;
  };
  await make(`active ${token}`, false);
  await make(`trashed ${token}`, true);
  await page.goto('/trash');
  await page.getByRole('searchbox', { name: 'Search trash' }).fill(token);
  await page.getByRole('searchbox', { name: 'Search trash' }).press('Enter');
  await expect(page).toHaveURL(/\/trash\?q=/);
  const rows = page.getByTestId('trash-note');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(`trashed ${token}`);
  await expect(page.getByText(`active ${token}`)).toHaveCount(0);
  const selectAll = page.getByRole('checkbox', {
    name: 'Select all',
    exact: true,
  });
  const restore = page.getByRole('button', {
    name: 'Restore selected notes',
    exact: true,
  });
  // With nothing selected the bulk icons are visible but cannot be clicked.
  await expect(restore).toBeDisabled();
  await selectAll.check();
  await expect(
    page.getByRole('checkbox', { name: /Select note from/ }),
  ).toBeChecked();
  await expect(restore).toBeEnabled();
  await selectAll.uncheck();
  await expect(restore).toBeDisabled();
});

test('Trash shows 30 notes, lazy-loads more on scroll, and keeps every row the same height', async ({
  page,
}) => {
  const headers = await authenticatedHeaders(page);
  const token = randomUUID().slice(0, 8);
  for (let n = 0; n < 32; n++) {
    // Long bodies must clamp, not stretch their row.
    const body = `paged ${token} ${n} ${n % 2 ? 'lorem ipsum dolor '.repeat(60) : 'short'}`;
    const created = await page.request.post('/api/notes', {
      headers,
      data: {
        action: 'create',
        mutationId: randomUUID(),
        content: {
          bodyMarkdown: body,
          timelineAt: Date.UTC(2021, 0, 3) + n,
          location: null,
          attachmentIds: [],
        },
      },
    });
    const id = (await created.json()).data.noteId as string;
    expect(
      (
        await page.request.post(`/api/notes/${id}/actions`, {
          headers,
          data: {
            action: 'trash',
            noteId: id,
            expectedRevision: 1,
            mutationId: randomUUID(),
          },
        })
      ).status(),
    ).toBe(200);
  }
  await page.goto(`/trash?q=${token}`);
  const rows = page.getByTestId('trash-note');
  await expect(rows).toHaveCount(30);
  const heights = await page
    .locator('.note-list > li')
    .evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().height)),
    );
  expect(new Set(heights).size).toBe(1);
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows).toHaveCount(32);
});
