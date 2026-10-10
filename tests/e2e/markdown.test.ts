import { browserSession } from '../helpers/browser-session.ts';
import { expect, test } from '@playwright/test';
const fixture = 'http://127.0.0.1:4174';

test('built private composer previews highlighted code and Mermaid under the production CSP without uploading', async ({
  page,
}) => {
  await browserSession(page);
  const mutations: string[] = [];
  const violations: string[] = [];
  page.on('request', (request) => {
    if (!['GET', 'HEAD'].includes(request.method()))
      mutations.push(request.url());
  });
  page.on('console', (message) => {
    if (/violates.*directive|Content Security Policy/i.test(message.text()))
      violations.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await page
    .getByRole('textbox', { name: 'Note text' })
    .fill(
      '```ts\nconst text = "香港";\n```\n\n```mermaid\nflowchart LR\n A[Write] --> B[Read]\n```',
    );
  await page
    .getByRole('switch', { name: 'Preview', exact: true })
    .first()
    .click();
  await expect(page.locator('.compact-preview pre.shiki')).toBeVisible({
    timeout: 30000,
  });
  await page
    .locator('.compact-preview [data-diagram]')
    .scrollIntoViewIfNeeded();
  await expect(page.locator('.compact-preview svg')).toBeVisible({
    timeout: 30000,
  });
  expect(
    await page
      .locator('.compact-preview svg')
      .evaluate((node) => node.getBoundingClientRect().width),
  ).toBeGreaterThan(100);
  await expect(page.locator('.compact-preview svg')).toContainText('Read');
  expect(mutations).toEqual([]);
  expect(violations).toEqual([]);
});

test('production Markdown renders GFM, safely copies original code, and never loads Mermaid without diagrams', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: fixture,
  });
  const requests: string[] = [];
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/violates.*directive|Content Security Policy/i.test(message.text()))
      violations.push(message.text());
  });
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`${fixture}/markdown.html`);
  await page.evaluate(() => {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (text) => {
      document.documentElement.dataset.copiedCode = text;
      return write(text);
    };
  });
  const code = '  const word = "<猫>";  \n\n';
  await page
    .getByLabel('Markdown source')
    .fill(
      `# Heading\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] task\n\n[link](https://example.test)\n\n\`\`\`ts\n${code}\`\`\``,
    );
  await expect(page.locator('.output table')).toBeVisible();
  const copy = page.getByRole('button', { name: 'Copy ts code' });
  await expect(copy).toBeVisible();
  await expect(page.locator('.output pre.shiki')).toBeVisible();
  expect(violations).toEqual([]);
  await copy.focus();
  await page.keyboard.press('Enter');
  await expect(copy).toHaveText('Copied!');
  // mdast preserves the intentional trailing blank line, excluding the fence's
  // structural newline, exactly as the source code value used by the renderer.
  expect(
    await page.evaluate(() => document.documentElement.dataset.copiedCode),
  ).toBe(code.slice(0, -1));
  // Windows' native clipboard changes LF to CRLF; verify its round trip too.
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      '\r\n',
      '\n',
    ),
  ).toBe(code.slice(0, -1));
  expect(
    requests.some((url) => /(?:deps\/mermaid|mermaid\.core)/.test(url)),
  ).toBe(false);
  expect(
    await page
      .locator('.output pre')
      .evaluate((node) => getComputedStyle(node).overflowX),
  ).toBe('auto');
  await page
    .getByLabel('Markdown source')
    .fill('```never-supported\n<script>attack</script>\n```');
  await expect(
    page.getByRole('button', { name: 'Copy never-supported code' }),
  ).toBeVisible();
  await expect(page.locator('.output pre')).toContainText(
    '<script>attack</script>',
  );
});

test('production diagrams are visible-only, debounced, theme-aware and isolated from invalid siblings', async ({
  page,
}) => {
  const requests: string[] = [];
  const violations: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('console', (message) => {
    if (/violates.*directive|Content Security Policy/i.test(message.text()))
      violations.push(message.text());
  });
  await page.goto(`${fixture}/markdown.html`);
  await page
    .getByLabel('Markdown source')
    .fill(
      `${'paragraph\n\n'.repeat(100)}\`\`\`mermaid\nflowchart LR\n A[Write] --> B[Read]\n\`\`\``,
    );
  await expect(page.locator('[data-diagram]')).toHaveCount(1);
  expect(requests.some((url) => /deps\/mermaid\.js/.test(url))).toBe(false);
  await page.locator('[data-diagram]').scrollIntoViewIfNeeded();
  await expect(page.locator('.output svg')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.output svg')).toContainText('Write');
  expect(requests.some((url) => /deps\/mermaid\.js/.test(url))).toBe(true);
  const lightId = await page.locator('.output svg').getAttribute('id');
  const lightFill = await page
    .locator('.output svg text')
    .first()
    .evaluate((node) => getComputedStyle(node).fill);
  expect(
    await page
      .locator('.output svg')
      .evaluate((node) => node.getBoundingClientRect().width),
  ).toBeGreaterThan(100);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await expect(page.locator('.output svg')).not.toHaveAttribute('id', lightId!);
  expect(
    await page
      .locator('.output svg text')
      .first()
      .evaluate((node) => getComputedStyle(node).fill),
  ).not.toBe(lightFill);
  await page
    .getByLabel('Markdown source')
    .fill(
      '```mermaid\nnot a diagram\n```\n\n```mermaid\nsequenceDiagram\nAlice->>Bob: Hello\n```',
    );
  await expect(page.locator('[data-diagram]')).toHaveCount(2);
  await page.locator('[data-diagram]').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.output')).toContainText(
    'Invalid Mermaid diagram',
  );
  await expect(page.locator('.output svg')).toContainText('Hello');
  await page
    .getByLabel('Markdown source')
    .fill('```mermaid\n' + 'A-->B;'.repeat(400) + '\n```');
  await expect(page.locator('.output')).toContainText('Diagram is too large');
  await page
    .getByLabel('Markdown source')
    .fill('```mermaid\nflowchart LR\n A-->B\n```');
  await page.getByLabel('Markdown source').fill('# Latest preview');
  await expect(page.locator('.output h1')).toHaveText('Latest preview');
  await expect(page.locator('.output svg')).toHaveCount(0);
  expect(violations).toEqual([]);
});

test('production sanitizers reject hostile HTML, URL, SVG and Mermaid assets before any attacker fetch', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(fixture)) external.push(request.url());
  });
  await page.goto(`${fixture}/markdown.html`);
  await page
    .getByLabel('Markdown source')
    .fill(
      '<img src="https://attacker.invalid/x" onerror="window.pwned=1">\n\n[x](javascript:window.pwned=1) ![x](https://attacker.invalid/x)\n\n```mermaid\nflowchart LR\n A-->B\n click A "https://attacker.invalid/x"\n```',
    );
  await expect(page.locator('.output')).toContainText(
    'configuration directives are disabled',
  );
  await expect(
    page.locator('.output img, .output [href^="javascript"], .output script'),
  ).toHaveCount(0);
  for (const source of [
    '%%{init: {"securityLevel":"loose"}}%%\nflowchart LR\n A-->B',
    '---\nconfig:\n securityLevel: loose\n---\nflowchart LR\n A-->B',
    'flowchart LR\n A["<img src=https://attacker.invalid/x>"]',
    'flowchart LR\n A@{ img: "https://attacker.invalid/x" }',
    'flowchart LR\n A-->B\n classDef bad fill:url(https://attacker.invalid/x)',
  ]) {
    await page
      .getByLabel('Markdown source')
      .fill(`\`\`\`mermaid\n${source}\n\`\`\``);
    await expect(page.locator('.output')).toContainText(
      'configuration directives are disabled',
    );
  }
  await page
    .getByLabel('Hostile SVG fixture')
    .fill(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="window.pwned=1"><script>window.pwned=1</script><foreignObject><img src="https://attacker.invalid/x" /></foreignObject><image href="https://attacker.invalid/x"/><a href="javascript:window.pwned=1"><text>x</text></a><style>@import url(https://attacker.invalid/x);</style><rect fill="url(https://attacker.invalid/x)" style="fill:u\\72l(https://attacker.invalid/x)" /></svg>',
    );
  await page.getByRole('button', { name: 'Sanitize production SVG' }).click();
  await expect(page.locator('#sanitized svg')).toHaveCount(1);
  await expect(
    page.locator(
      '#sanitized script, #sanitized image, #sanitized a, #sanitized foreignObject, #sanitized style, #sanitized [onload]',
    ),
  ).toHaveCount(0);
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
  expect(external).toEqual([]);
});

test('diagram deadlines and denied clipboard actions show safe feedback and allow recovery', async ({
  page,
}) => {
  await page.goto(`${fixture}/markdown.html`);
  await page.getByRole('button', { name: 'Simulate stalled Mermaid' }).click();
  await expect(page.locator('.output')).toContainText(
    'Diagram rendering timed out.',
    { timeout: 15000 },
  );
  await page
    .getByLabel('Markdown source')
    .fill(
      '```mermaid\nflowchart LR\n A-->B\n```\n\n```txt\nKeep this code\n```',
    );
  await expect(page.locator('.output svg')).toBeVisible();
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error('Denied');
    };
  });
  await page.getByRole('button', { name: 'Copy txt code' }).click();
  await expect(
    page.getByRole('button', { name: 'Copy txt code' }),
  ).toContainText('Copy failed');
  await expect(page.locator('.output pre')).toContainText('Keep this code');
});

test('composer preview switch keeps text and has no keyboard publishing shortcut on desktop and mobile', async ({
  page,
}) => {
  await page.goto(`${fixture}/shell.html`);
  await page.getByRole('button', { name: 'Write a note…' }).click();
  await page
    .getByRole('textbox', { name: 'Note text' })
    .fill('# 香港\n\n**A quiet note**');
  await page
    .getByRole('switch', { name: 'Preview', exact: true })
    .first()
    .click();
  await expect(page.locator('.compact-preview h1')).toHaveText('香港');
  await page
    .getByRole('switch', { name: 'Preview', exact: true })
    .first()
    .click();
  await page.getByRole('textbox', { name: 'Note text' }).press('Control+Enter');
  await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    /A quiet note/,
  );
  await expect(
    page.getByRole('button', { name: 'Post', exact: true }).first(),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Continue writing' }).click();
  const editor = page.getByRole('dialog', { name: 'Write a note' });
  await editor.getByRole('switch', { name: 'Preview', exact: true }).click();
  await expect(editor.locator('h1')).toHaveText('香港');
  await editor.getByRole('switch', { name: 'Preview', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: 'Note text' })).toHaveValue(
    /A quiet note/,
  );
});
