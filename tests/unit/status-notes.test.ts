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
