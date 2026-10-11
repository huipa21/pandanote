import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/lib/shared/markdown/render.ts';

describe('production Markdown pipeline with real remark/rehype/Shiki', () => {
  it('renders GFM and retains original code separately from highlighted HTML', async () => {
    const result = await renderMarkdown(
      '# Heading\n\n- [x] Task\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n~~old~~ [Link](https://example.test)\n\n```ts\n  const x = "<unsafe>";  \n\n```',
    );
    expect(result.html).toContain('<h1>Heading</h1>');
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('<del>old</del>');
    expect(result.html).toContain('shiki');
    expect(result.html).toContain('data-code="0"');
    expect(result.codes).toEqual(['  const x = "<unsafe>";  \n']);
    expect(result.html).not.toContain('<unsafe>');
  });
  it('keeps single newlines typed in a paragraph as visible line breaks', async () => {
    const result = await renderMarkdown('first line\nsecond #tag line\nthird');
    expect(result.html).toContain('first line<br>\nsecond');
    expect(result.html.match(/<br>/g)).toHaveLength(2);
    expect(result.html).toContain('<span class="tag-text">#tag</span>');
    expect(result.html).not.toContain('first line second');
  });
  it('gives every GFM task checkbox an accessible name without trusting source attributes', async () => {
    const result = await renderMarkdown(
      ['- [x] Done thing', '- [ ] Open <b>thing</b>'].join('\n'),
    );
    expect(result.html).toContain('aria-label="Completed task: Done thing"');
    expect(result.html).toContain('aria-label="Open task: Open thing"');
    expect(result.html.match(/<input/g)).toHaveLength(2);
    expect(result.html.match(/<input[^>]*aria-label=/g)).toHaveLength(2);
    expect(result.html).not.toContain('<b>');
  });
  it('strips active/raw HTML, unsafe links and arbitrary image fetches', async () => {
    const result = await renderMarkdown(
      '<script>alert(1)</script>\n\n<img src="https://attacker.invalid/x" onerror="alert(1)">\n\n[x](javascript:alert%281%29) [x](jav&#x61;script:bad) [x](//attacker.invalid/x) [x](data:text/html,attack) ![x](https://attacker.invalid/x)\n\n![ref][evil]\n\n[evil]: https://attacker.invalid/evil',
    );
    expect(result.html).not.toMatch(
      /<script|<img|onerror|href="(?:javascript|data|\/\/)/,
    );
    expect(result.html).not.toContain('src="https://');
    expect(result.html).toContain('Image unavailable');
  });
  it('resolves only validated descriptor-backed internal images', async () => {
    const id = '12345678-1234-4123-8123-123456789abc';
    const source = `![local](attachment:${id})`;
    expect((await renderMarkdown(source)).html).not.toContain('<img');
    const result = await renderMarkdown(source, [
      { id, url: `/api/attachments/${id}/display`, width: 320, height: 240 },
    ]);
    expect(result.html).toContain(`src="/api/attachments/${id}/display"`);
    expect(result.html).toContain('width="320"');
    expect(result.html).toContain('loading="lazy"');
    expect(
      (
        await renderMarkdown(`![local][ref]\n\n[ref]: attachment:${id}`, [
          { id, url: `/api/attachments/${id}/display` },
        ])
      ).html,
    ).toContain(`src="/api/attachments/${id}/display"`);
    expect(
      (await renderMarkdown(`![local][ref]\n\n[ref]: attachment:${id}`)).html,
    ).toContain('Image unavailable');
    expect(
      (
        await renderMarkdown(source, [
          { id, url: 'https://attacker.invalid/x' },
        ])
      ).html,
    ).not.toContain('<img');
  });
  it('matches reordered footnote code and nested code to the correct source', async () => {
    const result = await renderMarkdown(
      'Body[^x]\n\n[^x]: Footnote\n\n    ```txt\n    footnote code\n    ```\n\n```txt\nmain code\n```\n\n> ```txt\n> quoted code\n> ```',
    );
    expect(result.codes).toEqual(['main code', 'quoted code', 'footnote code']);
  });
  it('keeps unsupported languages readable and Mermaid inert', async () => {
    const result = await renderMarkdown(
      '```unknown\n<script>bad</script>\n```\n\n```mermaid\nflowchart LR\n A --> B\n```',
    );
    expect(result.codes).toEqual(['<script>bad</script>']);
    expect(result.diagrams).toEqual(['flowchart LR\n A --> B']);
    expect(result.html).toContain('data-diagram="0"');
    expect(result.html).not.toContain('<svg');
    expect(result.html).not.toContain('<script>');
  });
});
