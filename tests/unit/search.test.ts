import { expect, it } from 'vitest';
import {
  parseSearch,
  canonicalSearch,
  normalizeSearch,
  matchesSearch,
  searchSnippet,
} from '../../src/lib/shared/search.ts';
import {
  canonicalFilters,
  filterKey,
  filterHref,
  parseTimelineQuery,
} from '../../src/lib/shared/timeline.ts';
import { trigramLiteral } from '../../src/lib/server/search/query.ts';

it('parses bounded literal AND units, whole quoted phrases and explicit escapes', () => {
  expect(parseSearch('ＣＯＦＦＥＥ shop "exact phrase"')).toEqual([
    'coffee',
    'exact phrase',
    'shop',
  ]);
  expect(parseSearch('"say \\"hello\\"" \\\\path')).toEqual([
    '\\path',
    'say "hello"',
  ]);
  expect(parseSearch('\\x OR NEAR % _ *')).toEqual([
    '%',
    '*',
    '\\x',
    '_',
    'near',
    'or',
  ]);
  expect(canonicalSearch('shop COFFEE coffee')).toBe(
    canonicalSearch('coffee shop'),
  );
  for (const query of [
    '\0',
    '"',
    '""',
    '"abc"def',
    'abc"def',
    'a '.repeat(21),
    '猫'.repeat(257),
  ])
    expect(() => parseSearch(query)).toThrow();
  expect(parseSearch('😊'.repeat(256))).toHaveLength(1);
  expect(parseSearch(' \t\n ')).toEqual([]);
});
it('normalizes width/case/combining forms, not readings, accents or Han variants', () => {
  expect(normalizeSearch('ＴｙｐｅＳｃｒｉｐｔ e\u0301')).toBe('typescript é');
  const examples: [string, string, boolean][] = [
    ['Learning TypeScript today', 'typescript', true],
    ['Learning TypeScript today', 'typescrpt', false],
    ['今日食咗點心', '點心', true],
    ['去香港飲茶', '香港', true],
    ['猫が好き', '猫', true],
    ['今天学习数据库', '数据库', true],
    ['今天学习数据库', '資料庫', false],
    ['今日は図書館に行った', '図書館', true],
    ['今日は図書館に行った', 'としょかん', false],
    ['coffee at a new shop', 'coffee shop', true],
    ['coffee at a new shop', '"coffee shop"', false],
    ['visited a coffee shop', '"coffee shop"', true],
    ['café', 'cafe', false],
  ];
  for (const [body, query, match] of examples)
    expect(matchesSearch([body], parseSearch(query))).toBe(match);
  expect(
    matchesSearch(['coffee', 'shop.pdf'], parseSearch('coffee shop')),
  ).toBe(true);
  expect(
    matchesSearch(['coffee', 'shop.pdf'], parseSearch('"coffee shop"')),
  ).toBe(false);
});
it('conservatively accelerates codepoint-long plain units and scans all unsupported edges', () => {
  for (const unit of [
    'typescript',
    '数据库',
    '図書館',
    'coffee shop',
    'OR NEAR',
  ])
    expect(trigramLiteral(unit)).toBe(`"${unit}"`);
  for (const unit of [
    '猫',
    '香港',
    '😊😊',
    'abc%',
    'foo_bar',
    'e\u0301xx',
    '𠮷野家',
    'a\0bc',
    '"OR"',
  ])
    expect(trigramLiteral(unit)).toBeNull();
});
it('binds canonical query and half-open day alongside all tags in cursor identity/URLs', () => {
  const a = canonicalFilters(['Work'], 'COFFEE shop', { start: 100, end: 200 });
  expect(filterKey(a)).toBe(
    filterKey(
      canonicalFilters(['ｗｏｒｋ'], 'shop coffee', { start: 100, end: 200 }),
    ),
  );
  expect(
    parseTimelineQuery(
      new URL(filterHref(a), 'https://example.test').searchParams,
    ).filters,
  ).toEqual(a);
  for (const query of [
    'q=a&q=b',
    'dayStart=1',
    'dayEnd=2',
    'dayStart=2&dayEnd=1',
    'dayStart=x&dayEnd=2',
  ])
    expect(() => parseTimelineQuery(new URLSearchParams(query))).toThrow();
});
it('returns escaped-by-consumer normalized segments with unioned highlights and bounded Unicode text', () => {
  const source = normalizeSearch(
    'prefix '.repeat(1000) +
      '<img src=x onerror=alert(1)> ＣＡＦＥ́ 😊 ' +
      'tail'.repeat(1000),
  );
  const snippet = searchSnippet('body', source, parseSearch('"<img" CAFÉ'))!;
  expect(
    snippet.segments.filter((s) => s.highlighted).map((s) => s.text),
  ).toEqual(['<img', 'café']);
  expect(
    [...snippet.segments.map((s) => s.text).join('')].length,
  ).toBeLessThanOrEqual(322);
  const overlap = searchSnippet('body', 'ababa', ['aba', 'bab'])!;
  expect(overlap.segments).toEqual([{ text: 'ababa', highlighted: true }]);
});
