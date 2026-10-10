import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';
import { browserSession } from '../helpers/browser-session.ts';

// S18 accessibility gate: automated WCAG 2.x A/AA (+2.2 AA target size) axe scans of
// every shipped screen/dialog in light and dark themes at phone and desktop sizes,
// plus checks for the things automation cannot see (reflow at 200%/400% zoom,
// reduced motion, visible keyboard focus, landmarks/titles/language). Manual screen-
// reader/physical-device review is recorded separately in PROGRESS.
const origin = 'http://127.0.0.1:4173';
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
}
async function scan(page: Page, label: string) {
  // page.evaluate runs through CDP and is not subject to the page CSP.
  await page.evaluate(axeSource);
  const violations = await page.evaluate(
    async (tags) =>
      (
        await (
          window as unknown as {
            axe: {
              run: (
                context: Document,
                options: unknown,
              ) => Promise<{ violations: Violation[] }>;
            };
          }
        ).axe.run(document, {
          runOnly: { type: 'tag', values: tags },
          resultTypes: ['violations'],
        })
      ).violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => ({
          target: n.target,
          failureSummary: n.failureSummary?.slice(0, 300),
        })),
      })),
    TAGS,
  );
  expect(
    violations,
    `${label}\n${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}
async function headers(page: Page) {
  const cookies = await browserSession(page);
  return {
    origin,
    cookie: `pandanote_session=${cookies.find((c) => c.name === 'pandanote_session')!.value}`,
  };
}
async function seed(page: Page) {
  const h = await headers(page);
  const create = async (bodyMarkdown: string) => {
    const response = await page.request.post('/api/notes', {
      headers: h,
      data: {
        action: 'create',
        mutationId: crypto.randomUUID(),
        content: {
          bodyMarkdown,
          timelineAt: null,
          location: {
            latitude: 22.3,
            longitude: 114.1,
            accuracy: 10,
            label: 'Accessibility 香港',
          },
          attachmentIds: [],
        },
      },
    });
    expect(response.status()).toBe(200);
    return (await response.json()).data as { noteId: string; revision: number };
  };
  const published = await create(
    'Accessibility sample #a11y\n\n```ts\nconst n: number = 1;\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> quote\n\n- [x] done',
  );
  const draft = await create('Accessibility draft #a11ydraft');
  await page.request.post(`/api/notes/${draft.noteId}/actions`, {
    headers: h,
    data: {
      action: 'move-to-draft',
      noteId: draft.noteId,
      mutationId: crypto.randomUUID(),
      expectedRevision: draft.revision,
    },
  });
  const trash = await create('Accessibility trash #a11ytrash');
  await page.request.post(`/api/notes/${trash.noteId}/actions`, {
    headers: h,
    data: {
      action: 'trash',
      noteId: trash.noteId,
      mutationId: crypto.randomUUID(),
      expectedRevision: trash.revision,
    },
  });
  return { h, published };
}
async function theme(page: Page, value: 'light' | 'dark') {
  const h = await headers(page);
  const response = await page.request.patch('/api/settings/appearance', {
    headers: h,
    data: { theme: value, density: 'comfortable', collapseLongNotes: true },
  });
  expect(response.status()).toBe(200);
}

const SCREENS = ['/', '/drafts', '/trash', '/tags', '/settings'];
const SIZES = [
  { name: 'phone', width: 360, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
];

test.describe('axe WCAG 2.x AA scans', () => {
  test.setTimeout(240_000);
  test('public sign-in screen', async ({ browser }) => {
    for (const size of SIZES) {
      const context = await browser.newContext({ viewport: size });
      const page = await context.newPage();
      await page.goto('/login');
      await scan(page, `login ${size.name}`);
      await context.close();
    }
  });
  for (const mode of ['light', 'dark'] as const)
    test(`authenticated screens and dialogs (${mode})`, async ({ page }) => {
      const { published } = await seed(page);
      await theme(page, mode);
      for (const size of SIZES) {
        await page.setViewportSize(size);
        for (const path of [...SCREENS, `/notes/${published.noteId}`]) {
          await page.goto(path);
          await expect(page.locator('main').first()).toBeVisible();
          // Let lazy content (code highlighting, lists) settle before scanning.
          await page.waitForLoadState('networkidle');
          await scan(page, `${path} ${mode} ${size.name}`);
        }
        await page.goto('/');
        if (size.name === 'phone')
          await page.getByRole('button', { name: 'Menu & search' }).click();
        const calendar =
          size.name === 'phone'
            ? page.getByRole('dialog', { name: 'Notebook navigation' })
            : page.getByRole('complementary', { name: 'Sidebar' });
        await calendar.locator('.calendar-heading button').click();
        const picker = page.getByRole('dialog', {
          name: 'Choose year and month',
        });
        await expect(picker).toBeVisible();
        await scan(page, `month picker ${mode} ${size.name}`);
        await picker.getByRole('button', { name: /^Choose year,/ }).click();
        await scan(page, `quick year selector ${mode} ${size.name}`);
        await page.keyboard.press('Escape');
        if (size.name === 'phone') await page.keyboard.press('Escape');
        await page.getByRole('link', { name: 'Open note' }).first().click();
        await expect(page.getByRole('dialog').first()).toBeVisible();
        await scan(page, `note dialog ${mode} ${size.name}`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    });
  test('composer, image viewer and sensitive-action dialogs', async ({
    page,
  }) => {
    await seed(page);
    await theme(page, 'light');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Write a note…' }).click();
    await page
      .getByRole('textbox', { name: 'Note text' })
      .fill('Accessible image post #a11y');
    const png = await sharp({
      create: { width: 80, height: 60, channels: 3, background: '#2a7f5f' },
    })
      .png()
      .toBuffer();
    await page.getByLabel('Choose local files').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await expect(
      page
        .getByTestId('composer')
        .getByText('Attachments (1)', { exact: true }),
    ).toBeVisible();
    await scan(page, 'composer with attachment');
    const before = await page.getByTestId('posted-note').count();
    await page
      .getByTestId('composer')
      .getByRole('button', { name: 'Post', exact: true })
      .click();
    await expect(page.getByTestId('posted-note')).toHaveCount(before + 1, {
      timeout: 30_000,
    });
    await scan(page, 'timeline with image card');
    await page.getByRole('button', { name: /image/i }).first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible();
    await scan(page, 'image viewer');
    await page.keyboard.press('Escape');
    await page.goto('/settings');
    await page
      .getByTestId('backup-settings')
      .getByRole('button', { name: 'Create full backup', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Authorize backup action' }),
    ).toBeVisible();
    await scan(page, 'backup authorization dialog');
  });
});

test.describe('structure, reflow, motion and focus', () => {
  test('landmarks, title, language and zoom are not blocked on every screen', async ({
    page,
  }) => {
    await seed(page);
    await theme(page, 'light');
    for (const path of ['/login', ...SCREENS]) {
      await page.goto(path);
      expect(
        await page.evaluate(() => document.documentElement.lang),
        path,
      ).toMatch(/^[a-z]{2}/);
      await expect(page.locator('main'), path).toHaveCount(1);
      expect((await page.title()).length, path).toBeGreaterThan(3);
      const viewport = await page
        .locator('meta[name="viewport"]')
        .getAttribute('content');
      expect(viewport ?? '', path).not.toMatch(
        /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/,
      );
    }
  });

  test('content reflows without two-dimensional scrolling at 200% (640px) and 400% (320px) zoom', async ({
    page,
  }) => {
    const { published } = await seed(page);
    await theme(page, 'light');
    for (const width of [640, 320])
      for (const path of [...SCREENS, `/notes/${published.noteId}`]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => {
          const wide = [...document.querySelectorAll<HTMLElement>('body *')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.right > innerWidth + 1;
            })
            // Preformatted code and tables may scroll inside their own region.
            .filter((el) => !el.closest('pre, table, [tabindex="0"]'))
            .slice(0, 5)
            .map((el) => `${el.tagName}.${el.className}`);
          return {
            page: document.documentElement.scrollWidth - innerWidth,
            wide,
          };
        });
        expect(overflow.wide, `${path} at ${width}px`).toEqual([]);
        expect(overflow.page, `${path} at ${width}px`).toBeLessThanOrEqual(1);
      }
  });

  test('reduced motion removes non-essential transitions/animations', async ({
    page,
  }) => {
    await seed(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const path of ['/', '/settings']) {
      await page.goto(path);
      const offenders = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('*')]
          .filter((el) => {
            const s = getComputedStyle(el);
            const long = (v: string) =>
              v.split(',').some((t) => parseFloat(t) > 0.01);
            return long(s.transitionDuration) || long(s.animationDuration);
          })
          .slice(0, 5)
          .map((el) => `${el.tagName}.${el.className}`),
      );
      expect(offenders, path).toEqual([]);
    }
  });

  test('every focused control has a visible indicator; dialog focus is trapped and restored', async ({
    page,
  }) => {
    await seed(page);
    await theme(page, 'light');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const missing: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const outline =
          s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1;
        const shadow = s.boxShadow !== 'none';
        const border = el.matches('input, textarea, select');
        return {
          label: `${el.tagName}:${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? ''}`,
          visible: outline || shadow || border,
        };
      });
      if (state && !state.visible) missing.push(state.label);
    }
    expect(missing).toEqual([]);
    // Detail dialog: Tab stays inside, Escape closes and restores focus to the trigger.
    const trigger = page.getByRole('link', { name: 'Open note' }).first();
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog').first()).toBeVisible();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() => {
          const open = [...document.querySelectorAll('dialog[open]')].at(-1);
          return !!open && open.contains(document.activeElement);
        }),
      ).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute('href')),
    ).toMatch(/^\/notes\//);
  });
});
