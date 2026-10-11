import { describe, expect, it } from 'vitest';
import {
  canonicalFilters,
  filterHref,
  filterKey,
  noteHasTag,
  selectTag,
  parseTimelineQuery,
  currentMonthEnd,
  monthKey,
  mergeCards,
  boundedPreview,
  gridImages,
  shortDate,
  type TimelineCard,
} from '../../src/lib/shared/timeline.ts';

describe('thumbnail grid images', () => {
  it('lists photos not embedded in Markdown, in attachment order', () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const c = '33333333-3333-4333-8333-333333333333';
    const attachment = (id: string, kind: 'image' | 'file') => ({
      id,
      kind,
      filename: `${kind}-${id.slice(0, 1)}`,
    });
    const note = {
      bodyMarkdown: `![x](attachment:${a})\n\n![y][r]\n\n[r]: attachment:${b}`,
      attachments: [
        attachment(a, 'image'),
        attachment(b, 'image'),
        attachment(c, 'image'),
        attachment('44444444-4444-4444-8444-444444444444', 'file'),
      ],
    } as unknown as Parameters<typeof gridImages>[0];
    expect(gridImages(note).map((image) => image.id)).toEqual([c]);
    expect(
      gridImages({ ...note, bodyMarkdown: 'plain' }).map((i) => i.id),
    ).toEqual([a, b, c]);
  });
});

describe('canonical timeline state', () => {
  it('bounds UTF-8 previews without replacement characters or partial surrogate pairs', () => {
    const body = '香港😊'.repeat(3000);
    const preview = boundedPreview(body);
    expect(
      new TextEncoder().encode(preview.bodyMarkdown).length,
    ).toBeLessThanOrEqual(8192);
    expect(preview.bodyTruncated).toBe(true);
    expect(body.startsWith(preview.bodyMarkdown)).toBe(true);
    expect(preview.bodyMarkdown.includes('�')).toBe(false);
    expect(boundedPreview('short')).toEqual({
      bodyMarkdown: 'short',
      bodyTruncated: false,
    });
  });
  it('normalizes a single tag filter and selecting replaces it without implicit month filters', () => {
    const filters = canonicalFilters('Work');
    expect(filters.tag).toBe('work');
    expect(filterKey(canonicalFilters('ｗｏｒｋ'))).toBe(filterKey(filters));
    expect(filterKey(canonicalFilters('home'))).not.toBe(filterKey(filters));
    expect(filterKey({})).not.toBe(filterKey(filters));
    expect(filterHref(filters)).toBe('/?tag=work');
    expect(selectTag({}, '図書館')).toBe('/?tag=%E5%9B%B3%E6%9B%B8%E9%A4%A8');
    // Tag views are single-tag: selecting replaces, and the search is kept.
    expect(selectTag(filters, 'Home')).toBe('/?tag=home');
    expect(selectTag({ tag: 'a', query: 'x' }, 'B')).toBe('/?tag=b&q=%22x%22');
    expect(filterHref({})).toBe('/');
    // Leaving the tag view keeps the other filters.
    expect(filterHref({ tag: undefined, query: 'x' })).toBe('/?q=%22x%22');
    expect(canonicalFilters('ﬃ'.repeat(20)).tag).toBe('ffi'.repeat(20));
    expect(canonicalFilters('ﷺ').tag).toBe('صلى الله عليه وسلم');
    expect(() => canonicalFilters('')).toThrow();
  });
  it('matches a note to a tag filter by the tag itself or any subtag', () => {
    expect(noteHasTag(['work/meeting'], 'work')).toBe(true);
    expect(noteHasTag(['work'], 'work')).toBe(true);
    expect(noteHasTag(['workshop'], 'work')).toBe(false);
    expect(noteHasTag(['home', 'x/work'], 'work')).toBe(false);
    expect(noteHasTag([], 'work')).toBe(false);
  });
  it('rejects malformed and unbounded query parameters rather than silently changing meaning', () => {
    for (const query of [
      'limit=0',
      'limit=101',
      'limit=1.5',
      'limit=2&limit=3',
      'cursor=',
      'cursor=a&cursor=b',
      'q=%22unclosed',
      'day=2020-01-01',
      'tag=%23work',
      'tag=%00',
      `tag=${'港'.repeat(129)}`,
      'tag=a%2F%2Fb',
      'tag=a%2F',
      // A tag view has exactly one tag: repeated tag parameters are refused,
      // identical or not, instead of silently meaning something else.
      'tag=work&tag=home',
      'tag=work&tag=work',
      'tag=',
    ])
      expect(() => parseTimelineQuery(new URLSearchParams(query))).toThrow();
    expect(
      parseTimelineQuery(new URLSearchParams('tag=WORK&limit=100')).filters.tag,
    ).toBe('work');
    expect(
      parseTimelineQuery(new URLSearchParams('limit=100')).filters.tag,
    ).toBeUndefined();
  });
  it('uses app timezone at month/year boundaries, not host timezone', () => {
    const at = Date.parse('2025-12-31T16:30:00Z');
    expect(monthKey(at, 'Asia/Hong_Kong')).toBe('2026-01');
    expect(monthKey(at, 'UTC')).toBe('2025-12');
    expect(currentMonthEnd('Asia/Hong_Kong', at)).toBe(
      Date.parse('2026-01-31T16:00:00Z'),
    );
    expect(
      currentMonthEnd('America/New_York', Date.parse('2026-03-08T07:00:00Z')),
    ).toBe(Date.parse('2026-04-01T04:00:00Z'));
  });
  it('deduplicates overlapping pages, retains newer revisions and sorts backdated edits by binary ID ties', () => {
    const a = { id: 'a', timelineAt: 30, revision: 3 } as TimelineCard;
    const b = { id: 'b', timelineAt: 30, revision: 1 } as TimelineCard;
    const olderA = { ...a, revision: 2 };
    expect(mergeCards([a], [b, olderA])).toEqual([b, a]);
    expect(
      mergeCards([a, b], [{ ...a, timelineAt: 10, revision: 4 }]).map((n) => [
        n.id,
        n.timelineAt,
      ]),
    ).toEqual([
      ['b', 30],
      ['a', 10],
    ]);
  });
});

describe('card short date', () => {
  const now = Date.UTC(2026, 9, 12, 12);
  it('omits the year in the current year', () => {
    expect(shortDate(Date.UTC(2026, 6, 21, 12), 'UTC', now)).toBe(
      'Tue, Jul 21',
    );
  });
  it('adds the year for earlier years', () => {
    expect(shortDate(Date.UTC(2020, 6, 21, 12), 'UTC', now)).toBe(
      'Tue, Jul 21, 2020',
    );
  });
  it('uses the account timezone for the day and the year boundary', () => {
    const at = Date.UTC(2025, 11, 31, 20); // 2026-01-01 04:00 in Hong Kong
    expect(shortDate(at, 'Asia/Hong_Kong', now)).toBe('Thu, Jan 1');
    expect(shortDate(at, 'UTC', now)).toBe('Wed, Dec 31, 2025');
  });
});
