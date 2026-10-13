import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  staleTags,
  rewriteTagKeys,
  tagActionSchema,
  type TagChange,
} from '../../src/lib/shared/tags.ts';
import { canonicalNoteMutation } from '../../src/lib/shared/notes.ts';
const history: TagChange[] = [
  { generation: 1, oldKey: 'work', action: 'rename', targetKey: '仕事' },
  { generation: 2, oldKey: '仕事', action: 'merge', targetKey: '香港' },
  { generation: 3, oldKey: '香港', action: 'remove', targetKey: null },
];
const gone = (key: string, generation: number) => ({
  key,
  generation,
  target: null,
  targetPrefix: null,
  suffixStart: 1,
});
describe('S14 history and source contracts', () => {
  it('follows chronological chains, ignores case-only identity changes, binds recreation acknowledgements to the latest retirement', () => {
    expect(staleTags(['work', '仕事', '香港', 'other'], history)).toEqual([
      gone('work', 1),
      gone('仕事', 2),
      gone('香港', 3),
    ]);
    expect(
      staleTags(['work'], history, [{ key: 'work', generation: 1 }]),
    ).toEqual([]);
    expect(
      staleTags(
        ['work'],
        [
          ...history,
          {
            generation: 4,
            oldKey: 'work',
            action: 'rename',
            targetKey: 'work',
          },
        ],
      ),
    ).toEqual([gone('work', 1)]);
    expect(
      staleTags(
        ['work'],
        [
          ...history,
          { generation: 5, oldKey: 'work', action: 'rename', targetKey: 'new' },
        ],
        [{ key: 'work', generation: 1 }],
      ),
    ).toEqual([
      {
        key: 'work',
        generation: 5,
        target: 'new',
        targetPrefix: 'new',
        suffixStart: 1,
      },
    ]);
    expect(
      staleTags(
        ['work'],
        [
          history[0],
          {
            generation: 2,
            oldKey: '仕事',
            action: 'rename',
            targetKey: 'work',
          },
        ],
      ),
    ).toEqual([
      {
        key: 'work',
        generation: 1,
        target: 'work',
        targetPrefix: 'work',
        suffixStart: 1,
      },
    ]);
  });
  it('uses simultaneous literal source spans; leaves URLs/code/escapes/HTML byte-identical and does not reserialize Markdown', () => {
    const source =
      '#Work (#work) #香港\r\n\r\n`#work` \\#work https://x.invalid/#work [#Work](https://x.invalid/#work)\r\n\r\n```txt\r\n#work\r\n```\r\n\r\n<b>#work</b>';
    expect(
      rewriteTagKeys(
        source,
        new Map([
          ['work', '香港'],
          ['香港', null],
        ]),
      ),
    ).toBe(
      '#香港 (#香港) \r\n\r\n`#work` \\#work https://x.invalid/#work [#香港](https://x.invalid/#work)\r\n\r\n```txt\r\n#work\r\n```\r\n\r\n<b>#work</b>',
    );
  });
  it('omits empty acknowledgements from the canonical payload, and binds explicit generations into retry identity', () => {
    const command = {
      action: 'create' as const,
      mutationId: randomUUID(),
      content: {
        bodyMarkdown: '#Work',
        timelineAt: 1,
        attachmentIds: [],
      },
    };
    const canonical = canonicalNoteMutation(command);
    expect(canonical).toBe(
      JSON.stringify([
        'pandanote-note-mutation-v2',
        'create',
        null,
        null,
        ['#Work', 1, []],
        null,
      ]),
    );
    expect(
      canonicalNoteMutation({
        ...command,
        content: { ...command.content, tagAcknowledgements: [] },
      }),
    ).toBe(canonical);
    expect(
      canonicalNoteMutation({
        ...command,
        content: {
          ...command.content,
          tagAcknowledgements: [{ key: 'work', generation: 1 }],
        },
      }),
    ).not.toBe(canonical);
    expect(
      tagActionSchema.safeParse({
        source: 'work',
        action: 'remove',
        target: 'other',
        scope: 'subtree',
      }).success,
    ).toBe(false);
    expect(
      tagActionSchema.safeParse({
        source: 'work',
        action: 'rename',
        target: 'bad tag',
        scope: 'subtree',
      }).success,
    ).toBe(false);
  });
});
