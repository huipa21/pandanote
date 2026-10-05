import { describe, expect, it } from 'vitest';
import {
  parseStatusQuery,
  statusExcerpt,
} from '../../src/lib/shared/status-notes.ts';
describe('S13 status-list boundary', () => {
  it('requires explicit draft/Trash selection and bounds/uniqueness', () => {
    expect(parseStatusQuery(new URLSearchParams('status=draft'))).toEqual({
      status: 'draft',
      limit: 30,
      cursor: null,
    });
    for (const input of [
      '',
      'status=published',
      'status=draft&limit=0',
      'status=draft&limit=1000',
      'status=draft&limit=01',
      'status=draft&cursor=',
      'status=draft&status=trash',
      'status=trash&q=secret',
      'status=trash&limit=1&limit=2',
    ])
      expect(() => parseStatusQuery(new URLSearchParams(input))).toThrow();
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
