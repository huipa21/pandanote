import { describe, expect, it } from 'vitest';
import {
  extractTags,
  tagSpans,
  validateTag,
} from '../../src/lib/shared/markdown/tags.ts';
import {
  buildTagTree,
  compareTagPaths,
  filterTagTree,
  flattenTagTree,
  isWithinTag,
  joinTagSuffix,
  replaceTagPrefix,
  tagAncestors,
  tagParentKeys,
  tagPathDisplays,
  tagSubtreeUpper,
} from '../../src/lib/shared/tag-tree.ts';
import {
  rewriteTagKeys,
  staleTags,
  tagActionSchema,
  tagKeySchema,
  tagSuggestionList,
  type TagChange,
} from '../../src/lib/shared/tags.ts';
import { canonicalFilters } from '../../src/lib/shared/timeline.ts';

describe('NT-PARSE nested hashtag grammar', () => {
  it('extracts slash paths with case-insensitive whole-path identity', () => {
    expect(
      extractTags('#Work/Meeting #work/meeting #香港/美食 #a/b/c (#x/y)'),
    ).toEqual([
      { key: 'work/meeting', spelling: 'Work/Meeting' },
      { key: '香港/美食', spelling: '香港/美食' },
      { key: 'a/b/c', spelling: 'a/b/c' },
      { key: 'x/y', spelling: 'x/y' },
    ]);
  });
  it('ends at trailing or doubled slashes and ignores a leading slash', () => {
    const source = '#a/ #b//c #/d e#f/g';
    expect(tagSpans(source).map((s) => source.slice(s.start, s.end))).toEqual([
      '#a',
      '#b',
    ]);
  });
  it('keeps code, escapes, URLs, destinations and headings excluded', () => {
    expect(
      extractTags(
        '`#x/y` \\#esc/aped https://x.test/#url/path [#ok/label](https://t/#no/dest)\n\n## #head/ing\n\n```\n#fence/d\n```',
      ).map((t) => t.key),
    ).toEqual(['ok/label', 'head/ing']);
  });
  it('enforces depth, segment and path limits without truncation', () => {
    expect(validateTag('a/b/c/d/e')).toBe('a/b/c/d/e');
    expect(() => extractTags('#a/b/c/d/e/f')).toThrow('5 levels');
    expect(() => extractTags('#a/' + 'x'.repeat(65))).toThrow('1–64');
    const level = 'x'.repeat(40);
    expect(() => validateTag([level, level, level, level].join('/'))).toThrow(
      '128',
    );
    expect(validateTag('x'.repeat(64) + '/' + 'y'.repeat(63))).toHaveLength(
      128,
    );
  });
  it('rewrites nested spans right-to-left preserving other bytes', () => {
    const source = '**#Work/Meet** and #work and `#work/meet`\r\n#work/meet/x';
    expect(
      rewriteTagKeys(source, (span) =>
        isWithinTag(span.key, 'work/meet')
          ? joinTagSuffix('job', span.spelling, 2)
          : undefined,
      ),
    ).toBe('**#job** and #work and `#work/meet`\r\n#job/x');
    expect(() => rewriteTagKeys('#a', () => 'b/c/d/e/f/g')).toThrow();
  });
});

describe('path helpers', () => {
  it('computes ancestors, subtree membership, ranges and prefix replacement', () => {
    expect(tagAncestors('a/b/c')).toEqual(['a', 'a/b']);
    expect(isWithinTag('work/x', 'work')).toBe(true);
    expect(isWithinTag('workshop', 'work')).toBe(false);
    expect(isWithinTag('work', 'work')).toBe(true);
    // Every `work/...` key falls in the BINARY range; siblings do not.
    const upper = tagSubtreeUpper('work');
    for (const key of ['work/a', 'work/香港', 'work/\u{10FFFF}'])
      expect(key >= 'work/' && key < upper).toBe(true);
    for (const key of ['work-x', 'work', 'work0', 'workz'])
      expect(key >= 'work/' && key < upper).toBe(false);
    expect(replaceTagPrefix('work/a/b', 'work/a', 'job')).toBe('job/b');
    expect(() => replaceTagPrefix('other', 'work', 'job')).toThrow();
    expect(joinTagSuffix('Job', 'Work/Meet/X', 1)).toBe('Job/Meet/X');
    expect(joinTagSuffix('Job', 'Work', 1)).toBe('Job');
    expect(tagParentKeys(['a/b/c', 'a/d', 'e'])).toEqual(['a', 'a/b']);
    expect(['a/b', 'a-b', 'a', 'b'].sort(compareTagPaths)).toEqual([
      'a',
      'a/b',
      'a-b',
      'b',
    ]);
  });
  it('accepts bounded nested keys for filters and management', () => {
    expect(tagKeySchema.safeParse('work/meeting').success).toBe(true);
    for (const bad of ['work/', '/work', 'a//b', 'a/b/c/d/e/f', 'Work'])
      expect(tagKeySchema.safeParse(bad).success).toBe(false);
    expect(canonicalFilters('Work/Meeting').tag).toBe('work/meeting');
    expect(() => canonicalFilters('a//b')).toThrow();
    expect(() => canonicalFilters('x'.repeat(129))).toThrow();
    expect(
      tagActionSchema.safeParse({
        source: 'work',
        action: 'rename',
        target: 'job',
        scope: 'exact',
      }).success,
    ).toBe(false);
    expect(
      tagActionSchema.safeParse({
        source: 'work',
        action: 'remove',
        target: null,
        scope: 'exact',
      }).success,
    ).toBe(true);
  });
});

describe('NT-COUNT count-ordered tree', () => {
  const explicit = [
    { key: 'home', display: 'Home', count: 1 },
    { key: 'work', display: 'Work', count: 2 },
    { key: 'work/meeting', display: 'Work/Meeting', count: 2 },
    { key: 'work/zeta', display: 'work/Zeta', count: 2 },
    { key: 'a/b', display: 'A/B', count: 1 },
    { key: 'c', display: 'c', count: 1 },
  ];
  const tree = buildTagTree(
    explicit,
    new Map([
      ['work', 3],
      ['a', 1],
    ]),
  );
  it('orders every level by count descending then key, with distinct subtree counts', () => {
    expect(tree.map((n) => [n.key, n.count])).toEqual([
      ['work', 3],
      ['a', 1],
      ['c', 1],
      ['home', 1],
    ]);
    expect(tree[0].children.map((n) => [n.label, n.count])).toEqual([
      ['Meeting', 2],
      ['Zeta', 2],
    ]);
  });
  it('derives implicit parents from descendants and keeps explicit displays', () => {
    expect(tree[1]).toMatchObject({ key: 'a', display: 'A', label: 'A' });
    expect(tree[0]).toMatchObject({ display: 'Work', label: 'Work' });
    expect(flattenTagTree(tree).map((n) => n.key)).toEqual([
      'work',
      'work/meeting',
      'work/zeta',
      'a',
      'a/b',
      'c',
      'home',
    ]);
    expect(tagPathDisplays(explicit).get('a')).toBe('A');
  });
  it('filters by path or segment, keeping ancestors and revealing matches', () => {
    const { nodes, expanded } = filterTagTree(tree, 'meet');
    expect(nodes.map((n) => n.key)).toEqual(['work']);
    expect(nodes[0].children.map((n) => n.key)).toEqual(['work/meeting']);
    expect([...expanded]).toEqual(['work']);
    const group = filterTagTree(tree, 'work');
    expect(group.nodes[0].children).toHaveLength(2);
    expect(filterTagTree(tree, '').nodes).toHaveLength(4);
  });
});

describe('NT-STALE subtree history', () => {
  const at = (
    generation: number,
    oldKey: string,
    action: TagChange['action'],
    targetKey: string | null,
    scope: TagChange['scope'] = 'subtree',
  ): TagChange => ({ generation, oldKey, action, targetKey, scope });
  it('maps descendants of a renamed subtree and follows later events', () => {
    const history = [at(1, 'work', 'rename', 'job')];
    expect(staleTags(['work/new', 'work', 'workshop'], history)).toEqual([
      {
        key: 'work/new',
        generation: 1,
        target: 'job/new',
        targetPrefix: 'job',
        suffixStart: 1,
      },
      {
        key: 'work',
        generation: 1,
        target: 'job',
        targetPrefix: 'job',
        suffixStart: 1,
      },
    ]);
    const chain = [...history, at(2, 'job/new', 'merge', 'misc')];
    expect(staleTags(['work/new/x'], chain)[0]).toMatchObject({
      target: 'misc/x',
      targetPrefix: 'misc',
      suffixStart: 2,
    });
    const ancestor = [at(1, 'a/b', 'rename', 'c/d'), at(2, 'c', 'rename', 'e')];
    expect(staleTags(['a/b/x'], ancestor)[0]).toMatchObject({
      target: 'e/d/x',
      targetPrefix: 'e/d',
      suffixStart: 2,
    });
  });
  it('subtree removal retires descendants; exact removal does not', () => {
    expect(
      staleTags(['work/meeting'], [at(1, 'work', 'remove', null)]),
    ).toMatchObject([{ target: null, targetPrefix: null }]);
    expect(
      staleTags(['work/meeting'], [at(1, 'work', 'remove', null, 'exact')]),
    ).toEqual([]);
    expect(
      staleTags(
        ['work/x'],
        [at(1, 'work', 'rename', 'job'), at(2, 'job', 'remove', null)],
      ),
    ).toMatchObject([{ target: null }]);
  });
  it('excludes retired paths from suggestions and adds implicit parents by count', () => {
    expect(
      tagSuggestionList(
        [
          { key: 'work/meeting', display: 'Work/Meeting' },
          { key: 'old/x', display: 'old/x' },
          { key: 'zz', display: 'zz' },
        ],
        [at(1, 'old', 'rename', 'new')],
        new Map([
          ['zz', 5],
          ['work', 2],
          ['work/meeting', 2],
        ]),
      ),
    ).toEqual([
      { key: 'zz', display: 'zz', count: 5 },
      { key: 'work', display: 'Work', count: 2 },
      { key: 'work/meeting', display: 'Work/Meeting', count: 2 },
    ]);
  });
});
