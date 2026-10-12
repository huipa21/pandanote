import { expect, it } from 'vitest';
import { rateLimitAddress } from '../../src/lib/server/auth/rate-limits.ts';

it('SEC-XFF-6: IPv6 rate-limit keys are the canonical /64; mapped IPv4 and IPv4 use the IPv4 address', () => {
  const cases: [string, string][] = [
    ['192.0.2.1', '192.0.2.1'],
    ['::ffff:192.0.2.1', '192.0.2.1'],
    ['::ffff:c000:201', '192.0.2.1'],
    ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:db8:1:2:ffff:ffff:ffff:ffff', '2001:db8:1:2::/64'],
    ['2001:DB8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['2001:0db8:0000:0000:ffff::1', '2001:db8:0:0::/64'],
    ['2001:db8:0:0:1::', '2001:db8:0:0::/64'],
    ['2001:db8:0:1::1', '2001:db8:0:1::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fd00::5', 'fd00:0:0:0::/64'],
    ['::ffff:0:0', '0.0.0.0'],
    ['64:ff9b::192.0.2.1', '64:ff9b:0:0::/64'],
  ];
  for (const [input, key] of cases) {
    expect(rateLimitAddress(input), input).toBe(key);
  }
  // Addresses in one /64 share a key; different /64s do not.
  expect(rateLimitAddress('2001:db8:1:2::1')).toBe(
    rateLimitAddress('2001:db8:1:2:dead:beef::2'),
  );
  expect(rateLimitAddress('2001:db8:1:3::1')).not.toBe(
    rateLimitAddress('2001:db8:1:2::1'),
  );
});
