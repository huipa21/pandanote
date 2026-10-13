import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  browserSession,
  authenticatedHeaders,
} from '../helpers/browser-session.ts';

test('tag management rewrites notes and Trash; open unsaved source receives explicit retired-tag choice', async ({
  page,
}) => {
  await browserSession(page);
  const headers = await authenticatedHeaders(page);
  const key = `tag${randomUUID().slice(0, 8)}`;
  const ids: string[] = [];
  for (let n = 0; n < 2; n++) {
    const result = await page.request.post('/api/notes', {
      headers,
      data: {
        action: 'create',
        mutationId: randomUUID(),
        content: {
          bodyMarkdown: `#${key} body`,
          timelineAt: null,
          attachmentIds: [],
        },
      },
    });
    ids.push((await result.json()).data.noteId);
  }
  await page.request.post(`/api/notes/${ids[1]}/actions`, {
    headers,
    data: {
      action: 'trash',
      mutationId: randomUUID(),
      noteId: ids[1],
      expectedRevision: 1,
    },
  });
  await page.goto('/');
  const text = page.getByTestId('composer').getByRole('textbox');
  await text.fill(`Unsaved #${key}`);
  const operation = {
    source: key,
    action: 'rename',
    target: `${key}new`,
    scope: 'subtree',
  };
  const preview = await page.request.post('/api/tags/preview', {
    headers,
    data: operation,
  });
  const data = (await preview.json()).data;
  expect(data.counts).toEqual({ published: 1, trash: 1 });
  const result = await page.request.post('/api/tags', {
    headers,
    data: {
      operation,
      previewToken: data.previewToken,
      confirmed: true,
      mutationId: randomUUID(),
    },
  });
  expect(result.status()).toBe(200);
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Review retired tags',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Apply rename/removal history locally' })
    .click();
  await expect(text).toHaveValue(`Unsaved #${key}new`);
  await page
    .getByTestId('composer')
    .getByRole('button', { name: 'Post', exact: true })
    .click();
  await expect(page.getByTestId('composer')).toContainText('Saved on server.');
  for (const id of ids) {
    const note = (
      await (await page.request.get(`/api/notes/${id}`, { headers })).json()
    ).data;
    expect(note.bodyMarkdown).toBe(`#${key}new body`);
  }
});
