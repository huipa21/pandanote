import { expect, it } from 'vitest';

it('can lazily highlight code with a reusable/disposable Shiki instance', async () => {
  const { createHighlighter } = await import('shiki');
  const highlighter = await createHighlighter({
    themes: ['github-light', 'github-dark'],
    langs: ['typescript'],
  });
  try {
    const html = highlighter.codeToHtml('const text = "<script>";\n', {
      lang: 'typescript',
      theme: 'github-light',
    });
    expect(html).toContain('class="shiki');
    expect(html).toContain('&#x3C;script>');
    expect(html).not.toContain('<script>');
  } finally {
    highlighter.dispose();
  }
});
