import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';
import { authenticatedHeaders } from '../helpers/browser-session.ts';

const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);
/** WCAG 2.x A/AA (+2.2 AA) axe violation ids for the current page. */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  return page.evaluate(async () =>
    (
      await (
        window as unknown as {
          axe: {
            run: (
              context: Document,
              options: unknown,
            ) => Promise<{ violations: { id: string }[] }>;
          };
        }
      ).axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
        resultTypes: ['violations'],
      })
    ).violations.map((v) => v.id),
  );
}
export async function create(
  page: Page,
  bodyMarkdown: string,
  timelineAt: number | null = null,
): Promise<string> {
  const response = await page.request.post('/api/notes', {
    headers: await authenticatedHeaders(page),
    data: {
      action: 'create',
      mutationId: randomUUID(),
      content: { bodyMarkdown, timelineAt, attachmentIds: [] },
    },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).data.noteId;
}
export const card = (page: Page, id: string) =>
  page.locator(`[data-testid="posted-note"][data-note-id="${id}"]`);
export const menu = (page: Page) => page.getByRole('menu');
export async function openMenu(page: Page, id: string) {
  await card(page, id).getByRole('button', { name: 'Note actions' }).click();
  await expect(menu(page)).toBeVisible();
}
export const pick = (page: Page, name: string) =>
  page.getByRole('menuitem', { name, exact: true }).click();
