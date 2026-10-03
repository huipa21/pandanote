import { describe, expect, it } from 'vitest';
import {
  extractTags,
  rewriteTag,
  tagSpans,
} from '../../src/lib/shared/markdown/tags.ts';

describe('source-span Unicode hashtags', () => {
  it('normalizes, deduplicates and preserves spelling', () => {
    expect(
      extractTags(
        '#Work #work #ＷＯＲＫ (#香港) 「#図書館」 #数据库 #cafe\u0301 #a-b_c #one/two',
      ),
    ).toEqual([
      { key: 'work', spelling: 'Work' },
      { key: '香港', spelling: '香港' },
      { key: '図書館', spelling: '図書館' },
      { key: '数据库', spelling: '数据库' },
      { key: 'café', spelling: 'cafe\u0301' },
      { key: 'a-b_c', spelling: 'a-b_c' },
      { key: 'one', spelling: 'one' },
    ]);
  });
  it('excludes code, escapes, HTML, heading markers, URLs and destinations', () => {
    const source =
      '# Heading\n\n`#inline` \\#escaped &#35;entity <span>#html</span> #yes\n\n```md\n#fence\n```\n\n    #indented\n\nhttps://example.test/#url <https://example.test/#angle> [#label](https://test/#destination) ![#alt](attachment:id)\n\n<div>\n#block\n</div>\n\n## #headingtag';
    expect(extractTags(source).map((tag) => tag.key)).toEqual([
      'yes',
      'label',
      'headingtag',
    ]);
  });
  it('rewrites exact UTF-16/CRLF spans, preserving every other byte', () => {
    const source =
      '😀 **#Work**\r\n\r\n[#work](https://test/#work) `#work` \\#work <b>#work</b>\r\n\r\n```js\r\n#work\r\n```\r\n';
    const spans = tagSpans(source);
    expect(spans.map((span) => source.slice(span.start, span.end))).toEqual([
      '#Work',
      '#work',
    ]);
    expect(rewriteTag(source, 'WORK', '香港')).toBe(
      source.replace('**#Work**', '**#香港**').replace('[#work]', '[#香港]'),
    );
    expect(rewriteTag(source, 'work', null)).toBe(
      source.replace('**#Work**', '****').replace('[#work]', '[]'),
    );
  });
  it('does not mistake escaped markers/adjacent words for tags', () => {
    expect(extractTags('word#no ##no \\\\#no #ok #😀 #two')).toEqual([
      { key: 'ok', spelling: 'ok' },
      { key: 'two', spelling: 'two' },
    ]);
  });
  it('enforces codepoint length and unique count without truncating', () => {
    expect(() => extractTags('#' + '猫'.repeat(65))).toThrow('1–64');
    expect(() =>
      extractTags(Array.from({ length: 101 }, (_, i) => `#tag${i}`).join(' ')),
    ).toThrow('100');
    expect(extractTags(Array(150).fill('#same').join(' '))).toHaveLength(1);
  });
});
