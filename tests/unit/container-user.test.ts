import { describe, expect, it } from 'vitest';
import { containerIdentity } from '../../scripts/container-user.ts';

describe('container user configuration', () => {
  it('defaults to a non-root identity and accepts configured IDs', () => {
    expect(containerIdentity({})).toEqual({ uid: 1000, gid: 1000 });
    expect(containerIdentity({ PUID: '1001', PGID: '2000' })).toEqual({
      uid: 1001,
      gid: 2000,
    });
  });
  it.each(['0', '-1', '1.5', '', 'root', '01', '2147483648', '1;id'])(
    'rejects unsafe UID/GID %s',
    (value) => {
      expect(() => containerIdentity({ PUID: value })).toThrow();
      expect(() => containerIdentity({ PGID: value })).toThrow();
    },
  );
});
