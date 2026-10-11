import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  A,
  B,
  DIR,
  PASSWORD,
  freshCode,
  signIn,
  usedCodes,
  type Seed,
} from './support';

// Run after the two-domain drill against the same external production image.
test('IMG-UI: built Alpine SSR/preview deferred grammar, lazy Mermaid and hostile-policy isolation', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const seed = JSON.parse(readFileSync(`${DIR}/seed.json`, 'utf8')) as Seed;
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    const labels = JSON.parse(
      process.env.IMAGE_EXPECTED_LABELS ?? 'null',
    ) as Record<string, string> | null;
    if (!labels)
      throw new Error(
        'IMAGE_EXPECTED_LABELS from the tested image inspect is required',
      );
    const version = labels['org.opencontainers.image.version'];
    const commit = labels['org.opencontainers.image.revision'];
    const committedAt = labels['org.opencontainers.image.created'];
    async function identity(origin: string) {
      await page.goto(`${origin}/settings`);
      await expect(
        page.locator('.desktop-sidebar [data-app-version]'),
      ).toHaveText(`Version ${version}`);
      await expect(page.locator('[data-about-version]')).toHaveText(version);
      await expect(page.locator('[data-about-commit]')).toHaveText(commit);
      await expect(
        page.locator('time').filter({ hasText: committedAt }),
      ).toHaveAttribute('datetime', committedAt);
      await page.setViewportSize({ width: 360, height: 800 });
      await page.getByRole('button', { name: 'Menu & search' }).click();
      await expect(
        page.getByRole('dialog').locator('[data-app-version]'),
      ).toHaveText(`Version ${version}`);
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1440, height: 900 });
      const staticContext = await browser.newContext({
        javaScriptEnabled: false,
        ignoreHTTPSErrors: true,
      });
      try {
        await staticContext.addCookies(await context.cookies());
        const staticPage = await staticContext.newPage();
        await staticPage.goto(`${origin}/settings`);
        await expect(staticPage.locator('[data-about-commit]')).toHaveText(
          commit,
        );
      } finally {
        await staticContext.close();
      }
    }
    const attackers: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('attacker.invalid'))
        attackers.push(request.url());
    });
    await signIn(page, A, PASSWORD, await freshCode(seed.secret, usedCodes));
    await identity(A); // Source after restart: OCI/SSR/sidebar/mobile/About agree.
    await page.goto(`${A}/?q=published`);
    await expect(page.locator('[data-diagram]')).toHaveCount(0);
    const initial = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.endsWith('.js'))
        .map((entry) => entry.name),
    );
    await page.goto(`${A}/?q=diagram`);
    await expect(page.locator('.shiki').first()).toBeVisible();
    await expect(page.locator('[data-diagram] svg').first()).toBeVisible({
      timeout: 60_000,
    });
    const extraBytes = await page.evaluate(
      (initial) =>
        performance
          .getEntriesByType('resource')
          .filter(
            (entry) =>
              entry.name.endsWith('.js') && !initial.includes(entry.name),
          )
          .reduce(
            (sum, entry) =>
              sum + (entry as PerformanceResourceTiming).decodedBodySize,
            0,
          ),
      initial,
    );
    expect(extraBytes).toBeGreaterThan(300 * 1024); // Library not eagerly fetched on no-diagram page.
    await page
      .getByRole('textbox', { name: 'Note text' })
      .fill(
        '```sql\nSELECT 1 AS deferred_grammar;\n```\n\n```mermaid\ngraph TD; A-->B\n```\n\n```mermaid\ngraph TD; A-->B; click A "https://attacker.invalid"\n```',
      );
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const composer = page.getByTestId('composer');
    await expect(composer.locator('.shiki')).toBeVisible();
    await expect(composer.locator('[data-diagram] svg')).toBeVisible({
      timeout: 30_000,
    });
    await composer.locator('[data-diagram]').last().scrollIntoViewIfNeeded();
    await expect(
      composer.getByText(/configuration directives are disabled/i),
    ).toBeVisible();
    expect(attackers).toEqual([]);
    await signIn(page, B, PASSWORD, await freshCode(seed.secret, usedCodes));
    await identity(B); // Restored destination keeps the destination image identity.
  } finally {
    await context.close();
  }
});
