import { expect, test } from '@playwright/test';

const fixture = 'http://127.0.0.1:4174';

test('Mermaid is dynamically loaded and sanitized under a script-safe CSP', async ({
  page,
}) => {
  const requests: string[] = [];
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|violates.*directive/i.test(message.text()))
      violations.push(message.text());
  });
  page.on('request', (request) => requests.push(request.url()));
  const response = await page.goto(fixture);
  expect(response?.headers()['content-security-policy']).toContain(
    "script-src 'self'",
  );
  expect(response?.headers()['content-security-policy']).not.toContain(
    'unsafe-eval',
  );
  await expect(page.getByRole('status')).toHaveText('Not loaded');
  expect(requests.filter((url) => /deps\/mermaid\.js/.test(url))).toHaveLength(
    0,
  );
  await page.getByRole('button', { name: 'Render diagram' }).click();
  await expect(page.getByRole('status')).toHaveText('Rendered', {
    timeout: 30000,
  });
  expect(requests.some((url) => /deps\/mermaid\.js/.test(url))).toBe(true);
  await expect(page.locator('#output svg')).toBeVisible();
  await expect(
    page.locator('#output foreignObject, #output script, #output a'),
  ).toHaveCount(0);
  await expect(page.locator('#output')).toContainText('Write');

  await page.locator('#source').fill('sequenceDiagram\nAlice->>Bob: Hello');
  await page.getByRole('button', { name: 'Render diagram' }).click();
  await expect(page.getByRole('status')).toHaveText('Rendered');
  await expect(page.locator('#output')).toContainText('Hello');
  expect(violations).toEqual([]);
  await page.locator('#source').fill('this is not a valid diagram !');
  await page.getByRole('button', { name: 'Render diagram' }).click();
  await expect(page.getByRole('status')).toHaveText('Invalid diagram');
});

test('hostile SVG and Mermaid click links cannot execute or fetch external assets', async ({
  page,
}) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(fixture)) external.push(request.url());
  });
  await page.goto(fixture);
  await page
    .locator('#source')
    .fill(
      `flowchart LR\n A[Safe] --> B[Node]\n click A "https://attacker.invalid/path" "attack"`,
    );
  await page.getByRole('button', { name: 'Render diagram' }).click();
  await expect(page.getByRole('status')).toHaveText('Rendered', {
    timeout: 30000,
  });
  await expect(
    page.locator('#output a, #output [href], #output [onclick]'),
  ).toHaveCount(0);
  await page.locator('#source')
    .fill(`<svg xmlns="http://www.w3.org/2000/svg" onload="window.pwned=1">
    <script>window.pwned=1</script><foreignObject><img src="https://attacker.invalid/image" onerror="window.pwned=1" /></foreignObject>
    <image href="https://attacker.invalid/image" /><a href="javascript:window.pwned=1"><text>attack</text></a>
    <style>@import url(https://attacker.invalid/style);</style><rect width="10" height="10" fill="url(https://attacker.invalid/paint)" onclick="window.pwned=1" />
  </svg>`);
  await page.getByRole('button', { name: 'Sanitize SVG' }).click();
  await expect(page.getByRole('status')).toHaveText('Sanitized');
  await expect(
    page.locator(
      '#output script, #output foreignObject, #output image, #output a, #output [onload], #output [onclick], #output style',
    ),
  ).toHaveCount(0);
  expect(await page.evaluate(() => 'pwned' in window)).toBe(false);
  expect(external).toEqual([]);
});
