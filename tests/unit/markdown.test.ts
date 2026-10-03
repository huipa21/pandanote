import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { rewriteProbeTag, textSpans } from '../spikes/markdown';
import { normalize } from '../spikes/search';

const source =
  '# Heading\r\n\r\n今日 #Work (#香港) **#work** \\#work 😀\r\n\r\n`#work`\r\n\r\n```ts\r\nconst tag = "#work";\r\n```\r\n\r\n[link](https://example.invalid/#work)\r\n\r\n<div>#work</div>\r\n';

describe('remark source-offset capability', () => {
  it('retains original UTF-16 offsets and CRLF for exact rewrites', () => {
    for (const span of textSpans(source))
      expect(source.slice(span.start, span.end)).toBe(span.text);
    expect(rewriteProbeTag(source, 'work', '新工作')).toBe(
      source
        .replace('今日 #Work', '今日 #新工作')
        .replace('**#work**', '**#新工作**'),
    );
    expect(rewriteProbeTag(source, '香港', '図書館')).toContain('(#図書館)');
  });

  it('renders GFM safely without executable raw HTML or unsafe link schemes', async () => {
    const output = String(
      await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeSanitize)
        .use(rehypeStringify)
        .process(
          '**safe**\n\n<script>alert(1)</script>\n\n[x](javascript:alert%281%29)\n\n- [x] done',
        ),
    );
    expect(output).toContain('<strong>safe</strong>');
    expect(output).toContain('type="checkbox"');
    expect(output).not.toMatch(/<script|javascript:|onclick/i);
  });
});

it('normalizes width and English case without converting Han variants/readings', () => {
  expect(normalize('ＴｙｐｅＳｃｒｉｐｔ')).toBe('typescript');
  expect(normalize('数据库')).not.toBe(normalize('資料庫'));
  expect(normalize('図書館')).not.toBe(normalize('としょかん'));
  expect(normalize('e\u0301')).toBe('é');
});
