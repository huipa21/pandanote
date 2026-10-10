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
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm restore', exact: true })
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
  await row
    .getByRole('button', { name: 'Permanently delete', exact: true })
    .click();
  await page
    .getByRole('button', {
      name: 'Close Permanently delete note?',
      exact: true,
    })
    .click();
  await expect(row).toHaveCount(1);
  await row
    .getByRole('button', { name: 'Permanently delete', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm permanent delete', exact: true })
    .click();
  await expect(row).toHaveCount(0);
  expect(
    (await page.request.get(`/api/notes/${note.noteId}`, { headers })).status(),
  ).toBe(404);
});
