import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, type Page } from '@playwright/test';
const source = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);
export async function scanSetup(page: Page) {
  for (const width of [390, 1440])
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.evaluate(source);
      const violations = await page.evaluate(async () => {
        const axe = (
          window as unknown as {
            axe: {
              run: (
                context: Document,
                options: unknown,
              ) => Promise<{ violations: unknown[] }>;
            };
          }
        ).axe;
        return (
          await axe.run(document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
            },
          })
        ).violations;
      });
      expect(violations, `${width}px ${colorScheme}`).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  await page.emulateMedia({ colorScheme: 'light' });
}
