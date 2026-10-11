import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { authenticatedHeaders } from '../helpers/browser-session.ts';
import {
  axeViolations,
  card,
  create,
  menu,
  openMenu,
  pick,
} from './note-actions-helpers.ts';

test('NA-LAYOUT/NA-MENU: tags row under the date row, borderless trigger and an anchored keyboard menu', async ({
  page,
}) => {
  const tag = `na${Date.now().toString(36)}`;
  const id = await create(page, `Menu note #${tag}`);
  const plain = await create(page, `Untagged menu note ${tag}`);
  await page.goto('/');
  const c = card(page, id);
  // Date row first, tags row directly beneath it, before the content.
  const order = await c.evaluate((node) =>
    [...node.querySelectorAll('header, ul.card-tags, .card-content')].map(
      (el) => (el.tagName === 'HEADER' ? 'header' : el.className),
    ),
  );
  expect(order[0]).toBe('header');
  expect(order[1]).toContain('card-tags');
  expect(await card(page, plain).locator('ul.card-tags').count()).toBe(0);
  const trigger = c.getByRole('button', { name: 'Note actions' });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const style = await trigger.evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.borderTopWidth, s.backgroundColor];
  });
  expect(style[0]).toBe('0px');
  expect(style[1]).toBe('rgba(0, 0, 0, 0)');

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(menu(page)).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const items = menu(page).getByRole('menuitem');
  await expect(items).toHaveText(['Pin', 'Edit', 'Delete']);
  await expect(items.first()).toBeFocused();
  // Anchored under the trigger, right-aligned to it.
  const t = (await trigger.boundingBox())!;
  const m = (await menu(page).boundingBox())!;
  expect(m.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  expect(Math.abs(m.x + m.width - (t.x + t.width))).toBeLessThan(2);
  await page.keyboard.press('ArrowUp');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  // Outside click closes; opening another card's menu closes the first.
  await trigger.click();
  await expect(menu(page)).toBeVisible();
  await page
    .getByRole('heading', { name: 'All notes', level: 1 })
    .click({ force: true });
  await expect(menu(page)).toHaveCount(0);
  await trigger.click();
  await card(page, plain).getByRole('button', { name: 'Note actions' }).click();
  await expect(menu(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByText('Copy Markdown')).toHaveCount(0);
});

test('NA-MENU: the dropdown stays inside a 390 px viewport and closes on scroll', async ({
  page,
}) => {
  const id = await create(page, `Mobile menu ${randomUUID()}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openMenu(page, id);
  const m = (await menu(page).boundingBox())!;
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.x + m.width).toBeLessThanOrEqual(390);
  expect(await axeViolations(page)).toEqual([]);
  await page.locator('#notes-pane').evaluate((n) => {
    n.scrollTop = 40;
    n.dispatchEvent(new Event('scroll'));
  });
  await expect(menu(page)).toHaveCount(0);
});

test('NA-PIN: pin moves a note to Pinned at the top, unpin icon restores it, other views keep date order', async ({
  page,
}) => {
  const tag = `pin${Date.now().toString(36)}`;
  const id = await create(
    page,
    `Old pinned ${tag} #${tag}`,
    Date.UTC(2019, 5, 1),
  );
  await create(page, `Newest unpinned ${tag}`);
  await page.goto(`/notes/${id}`);
  await page.getByRole('button', { name: 'Note actions' }).click();
  await pick(page, 'Pin');
  await expect(page.getByRole('button', { name: 'Unpin note' })).toBeVisible();
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Pinned', level: 2 }),
  ).toBeVisible();
  await expect(
    page.locator('section.pinned').locator(`[data-note-id="${id}"]`),
  ).toHaveCount(1);
  // It is the first card on the page, and not in a month section.
  expect(
    await page
      .locator('[data-testid="posted-note"]')
      .first()
      .getAttribute('data-note-id'),
  ).toBe(id);
  await openMenu(page, id);
  await expect(
    menu(page).getByRole('menuitem', { name: 'Unpin', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  // A tag view shows it in place, with the unpin icon but no Pinned section.
  await page.goto(`/?tag=${tag}`);
  await expect(card(page, id)).toBeVisible();
  await expect(
    card(page, id).getByRole('button', { name: 'Unpin note' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pinned' })).toHaveCount(0);
  // One click on the icon unpins without a menu or confirmation.
  await page.goto('/');
  await card(page, id).getByRole('button', { name: 'Unpin note' }).click();
  await expect(
    page.locator('section.pinned').locator(`[data-note-id="${id}"]`),
  ).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const note = (
    await (
      await page.request.get(`/api/notes/${id}`, {
        headers: await authenticatedHeaders(page),
      })
    ).json()
  ).data;
  expect(note.pinnedAt).toBeNull();
  expect(note.revision).toBe(3);
});

test('NA-DELETE: card Delete moves to Trash with no dialog or Undo; pinned note leaves Pinned; Trash page restores unpinned', async ({
  page,
}) => {
  const body = `Delete me ${randomUUID()}`;
  const id = await create(page, body);
  await page.goto('/');
  await openMenu(page, id);
  await pick(page, 'Pin');
  await expect(
    page.locator('section.pinned').locator(`[data-note-id="${id}"]`),
  ).toBeVisible();
  await openMenu(page, id);
  await pick(page, 'Delete');
  await expect(card(page, id)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Undo')).toHaveCount(0);
  await page.goto('/trash');
  const row = page.locator(`[data-testid="trash-note"][data-note-id="${id}"]`);
  await expect(row).toContainText(body);
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm restore', exact: true })
    .click();
  await expect(row).toHaveCount(0);
  const note = (
    await (
      await page.request.get(`/api/notes/${id}`, {
        headers: await authenticatedHeaders(page),
      })
    ).json()
  ).data;
  expect(note.status).toBe('published');
  expect(note.pinnedAt).toBeNull();
});

test('NA-DELETE: note page Delete returns to the timeline; Trash notes are read-only there', async ({
  page,
}) => {
  const id = await create(page, `Page delete ${randomUUID()}`);
  await page.goto(`/notes/${id}`);
  await page.getByRole('button', { name: 'Note actions' }).click();
  await pick(page, 'Delete');
  await expect(page).toHaveURL(/\/$/);
  await expect(card(page, id)).toHaveCount(0);
  await page.goto(`/notes/${id}`);
  await expect(page.getByText('In Trash', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Back to Trash/ }),
  ).toHaveAttribute('href', '/trash');
  for (const name of [
    'Restore',
    'Permanently delete',
    'Note actions',
    'Edit note',
  ])
    await expect(page.getByRole('button', { name })).toHaveCount(0);
});

test('NA-DELETE: a failed Delete opens the dialog in error state and retries the same action', async ({
  page,
}) => {
  const id = await create(page, `Failing delete ${randomUUID()}`);
  await page.goto('/');
  let calls = 0;
  const ids: string[] = [];
  await page.route(`**/api/notes/${id}/actions`, async (route) => {
    ids.push(route.request().postDataJSON().mutationId);
    if (calls++ === 0) return route.abort('failed');
    return route.continue();
  });
  await openMenu(page, id);
  await pick(page, 'Delete');
  const dialog = page.getByRole('dialog', { name: 'Move to Trash?' });
  await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button', { name: 'Retry same action' }).click();
  await expect(card(page, id)).toHaveCount(0);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});
