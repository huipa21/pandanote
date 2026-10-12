import { describe, expect, it } from 'vitest';
import {
  parseStatusQuery,
  statusExcerpt,
} from '../../src/lib/shared/status-notes.ts';
describe('S13 status-list boundary', () => {
  it('requires explicit Trash selection and bounds/uniqueness', () => {
    expect(parseStatusQuery(new URLSearchParams('status=trash'))).toEqual({
      status: 'trash',
      limit: 30,
      cursor: null,
      units: [],
    });
    for (const input of [
      '',
      'status=published',
      'status=draft',
      'status=trash&limit=0',
      'status=trash&limit=1000',
      'status=trash&limit=01',
      'status=trash&cursor=',
      'status=trash&status=draft',
      'status=trash&limit=1&limit=2',
      'status=trash&q=a&q=b',
      'status=trash&q=%22unclosed',
      'status=trash&q=%22a%22b',
      'status=trash&filter=secret',
    ])
      expect(() => parseStatusQuery(new URLSearchParams(input))).toThrow();
  });
  it('parses Trash search with the same literal grammar as note search', () => {
    expect(
      parseStatusQuery(new URLSearchParams('status=trash&q=Hello+%22A%20B%22')),
    ).toMatchObject({ units: ['a b', 'hello'] });
    expect(
      parseStatusQuery(new URLSearchParams('status=trash&q=%20%20')),
    ).toMatchObject({ units: [] });
  });
  it('uses content excerpts/image/file fallbacks, not titles or trusted HTML', () => {
    expect(statusExcerpt(' \n ', 1, 0)).toBe('Image note');
    expect(statusExcerpt('', 0, 1)).toBe('File attachment');
    expect(statusExcerpt('<script>香港\0\n 図書館</script>', 0, 0)).toBe(
      '<script>香港␀ 図書館</script>',
    );
    expect([...statusExcerpt('😀'.repeat(300), 0, 0)]).toHaveLength(241);
  });
});
