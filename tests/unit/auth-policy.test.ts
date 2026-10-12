import { expect, it } from 'vitest';
import {
  authTokenSchema,
  passwordSchema,
  setupAccountSchema,
} from '../../src/lib/shared/auth.ts';
import {
  authPolicy,
  clientIp,
  isPublicAuthRoute,
  sameOrigin,
  usesUnauthorizedResponse,
} from '../../src/lib/server/auth/policy.ts';

it('preserves Unicode password bytes and validates bounded credentials without extra fields', () => {
  expect(passwordSchema.parse('  長いパスワードの例として書く  ')).toBe(
    '  長いパスワードの例として書く  ',
  );
  expect(passwordSchema.safeParse('short').success).toBe(false);
  expect(passwordSchema.safeParse('a'.repeat(257)).success).toBe(false);
  expect(authTokenSchema.safeParse('../not-a-token').success).toBe(false);
  expect(
    setupAccountSchema.safeParse({
      username: 'fixture',
      email: 'fixture@example.invalid',
      password: 'a'.repeat(8),
      passwordConfirm: 'a'.repeat(8),
      setupCode: 'ABCDE-FGHJK-MNPQR-STUVW',
      admin: true,
    }).success,
  ).toBe(false);
});
it('defaults local origins, requires production ORIGIN and retains HTTPS/forwarding protections', () => {
  expect(authPolicy({}).origin).toBe('http://localhost:3000');
  expect(authPolicy({}, true).origin).toBe('http://localhost:5173');
  expect(() => authPolicy({ NODE_ENV: 'production' })).toThrow(
    /ORIGIN must be set/,
  );
  for (const origin of [
    'http://example.org',
    'https://a:secret@example.org',
    'https://example.org/path',
    'https://example.org/',
    'https://example.org?x=1',
  ])
    expect(() => authPolicy({ ORIGIN: origin })).toThrow();
  expect(
    authPolicy({ ORIGIN: 'https://notes.example.org', NODE_ENV: 'production' })
      .production,
  ).toBe(true);
  expect(authPolicy({ ORIGIN: 'http://localhost:5173' }).origin).toBe(
    'http://localhost:5173',
  );
  for (const name of [
    'ADDRESS_HEADER',
    'HOST_HEADER',
    'PROTOCOL_HEADER',
    'PORT_HEADER',
  ])
    expect(() =>
      authPolicy({ ORIGIN: 'https://notes.example.org', [name]: 'spoofable' }),
    ).toThrow(/overrides/);
  expect(
    authPolicy({ ORIGIN: 'https://notes.example.org', TRUSTED_PROXY_IPS: '*' })
      .origin,
  ).toBe('https://notes.example.org');
});
it('trusts exactly private peer ranges, including mapped v4, with single-IP XFF only', () => {
  const policy = authPolicy({});
  const privateIps = [
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '169.254.0.1',
    '::1',
    'fc00::1',
    'fdff::1',
    'fe80::1',
    'febf::1',
    'fe80::1%eth0',
    '::ffff:127.0.0.1',
    '::ffff:192.168.1.1',
    '::ffff:c0a8:101',
  ];
  const publicIps = [
    '192.0.2.3',
    '172.15.255.255',
    '172.32.0.1',
    '169.253.0.1',
    '100.64.0.1',
    '0.0.0.0',
    '::',
    '2001:db8::1',
    'fec0::1',
    'fbff::1',
    '::ffff:192.0.2.3',
    '::ffff:c000:203',
    '::192.168.1.1',
  ];
  const headers = new Headers({
    'x-forwarded-for': '198.51.100.20',
    'x-forwarded-host': 'attacker.invalid',
  });
  for (const peer of privateIps) {
    expect(clientIp(peer, headers, policy), peer).toBe('198.51.100.20');
    expect(clientIp(peer, new Headers(), policy), peer).toBe(peer);
    for (const invalid of [
      '',
      'not-an-ip',
      '198.51.100.20, 192.0.2.3',
      '198.51.100.20:123',
      '[::1]',
      '001.2.3.4',
    ])
      expect(
        () =>
          clientIp(peer, new Headers({ 'x-forwarded-for': invalid }), policy),
        peer,
      ).toThrow(/proxy/);
    expect(
      clientIp(peer, new Headers({ 'x-forwarded-for': '2001:db8::2' }), policy),
    ).toBe('2001:db8::2');
  }
  for (const peer of publicIps) {
    expect(clientIp(peer, headers, policy), peer).toBe(peer);
    expect(
      clientIp(
        peer,
        new Headers({ 'x-forwarded-for': 'invalid, chain' }),
        policy,
      ),
    ).toBe(peer);
  }
  for (const peer of ['', 'invalid', '[::1]', '127.0.0.1:80'])
    expect(() => clientIp(peer, headers, policy)).toThrow(/client address/);
});
it('SEC-XFF-1: TRUSTED_PROXIES unset or blank keeps the private-peer default', () => {
  const headers = new Headers({ 'x-forwarded-for': '198.51.100.20' });
  for (const value of [undefined, '', '   ']) {
    const policy = authPolicy({ TRUSTED_PROXIES: value });
    expect(policy.trustedPeers).toBe('private');
    expect(clientIp('10.1.2.3', headers, policy)).toBe('198.51.100.20');
    expect(clientIp('192.0.2.3', headers, policy)).toBe('192.0.2.3');
  }
});
it('SEC-XFF-2: TRUSTED_PROXIES=none never reads X-Forwarded-For, even from loopback or private peers', () => {
  for (const value of ['none', 'NONE', ' None ']) {
    const policy = authPolicy({ TRUSTED_PROXIES: value });
    expect(policy.trustedPeers).toBe(null);
    for (const peer of ['127.0.0.1', '10.0.0.5', '::1', 'fd00::1'])
      expect(
        clientIp(
          peer,
          new Headers({ 'x-forwarded-for': '198.51.100.20' }),
          policy,
        ),
        peer,
      ).toBe(peer);
    // Invalid or chained values are ignored rather than rejected.
    expect(
      clientIp(
        '10.0.0.5',
        new Headers({ 'x-forwarded-for': 'invalid, chain' }),
        policy,
      ),
    ).toBe('10.0.0.5');
  }
});
it('SEC-XFF-3: list mode reads X-Forwarded-For only from listed addresses and CIDRs', () => {
  const policy = authPolicy({
    TRUSTED_PROXIES: '10.0.5.2, 172.18.0.0/16,fd00::/8',
  });
  const headers = new Headers({ 'x-forwarded-for': '198.51.100.20' });
  for (const peer of ['10.0.5.2', '172.18.0.1', '172.18.255.254', 'fd12::7'])
    expect(clientIp(peer, headers, policy), peer).toBe('198.51.100.20');
  // Private but unlisted peers, and addresses just outside the CIDR, use their own address.
  for (const peer of [
    '10.0.5.3',
    '10.0.0.1',
    '172.19.0.1',
    '172.17.255.255',
    '127.0.0.1',
    '::1',
    'fe80::1',
    '203.0.113.9',
  ])
    expect(clientIp(peer, headers, policy), peer).toBe(peer);
  // Unlisted peers are not validated: malformed XFF is ignored for them.
  expect(
    clientIp('10.0.5.3', new Headers({ 'x-forwarded-for': 'bad' }), policy),
  ).toBe('10.0.5.3');
  expect(() =>
    clientIp('10.0.5.2', new Headers({ 'x-forwarded-for': 'bad' }), policy),
  ).toThrow(/proxy/);
});
it('SEC-XFF-4: IPv4-mapped IPv6 peers match IPv4 entries', () => {
  const policy = authPolicy({ TRUSTED_PROXIES: '10.0.5.2,172.18.0.0/16' });
  const headers = new Headers({ 'x-forwarded-for': '198.51.100.20' });
  for (const peer of ['::ffff:10.0.5.2', '::ffff:a00:502', '::ffff:172.18.4.4'])
    expect(clientIp(peer, headers, policy), peer).toBe('198.51.100.20');
  for (const peer of ['::ffff:10.0.5.3', '::ffff:172.19.0.1', '::10.0.5.2'])
    expect(clientIp(peer, headers, policy), peer).toBe(peer);
});
it('SEC-XFF-5: invalid TRUSTED_PROXIES values stop startup with the documented message', () => {
  const message =
    /TRUSTED_PROXIES must be none or a comma-separated list of IP addresses\/CIDRs/;
  const invalid = [
    '*',
    'example.org',
    'none, 10.0.0.1',
    '10.0.0.1,',
    ',10.0.0.1',
    '10.0.0.1 10.0.0.2',
    '10.0.0.1/33',
    '10.0.0.1/-1',
    '10.0.0.1/+8',
    '10.0.0.0/08',
    '10.0.0.0/8/8',
    '10.0.0.0/',
    'fd00::/129',
    '300.1.1.1',
    '001.2.3.4',
    'fe80::1%eth0',
    '10.0.0.1:443',
    Array.from({ length: 33 }, (_, i) => `10.0.0.${i}`).join(','),
  ];
  for (const value of invalid)
    expect(() => authPolicy({ TRUSTED_PROXIES: value }), value).toThrow(
      message,
    );
  const thirtyTwo = Array.from({ length: 32 }, (_, i) => `10.0.0.${i}`).join(
    ',',
  );
  expect(authPolicy({ TRUSTED_PROXIES: thirtyTwo }).trustedPeers).toBeDefined();
  // The retired name is never parsed, so it cannot reactivate old trust.
  expect(authPolicy({ TRUSTED_PROXY_IPS: '*' }).trustedPeers).toBe('private');
});
it('rejects missing/foreign/null origins and cross-site mutations, including login/setup/uploads', () => {
  const policy = authPolicy({ ORIGIN: 'https://notes.example.org' });
  for (const origin of [
    undefined,
    'null',
    'https://attacker.invalid',
    'https://notes.example.org.attacker.invalid',
  ])
    expect(
      sameOrigin(
        new Request('https://notes.example.org/api/auth/login', {
          method: 'POST',
          headers: origin ? { origin } : {},
        }),
        policy,
      ),
    ).toBe(false);
  expect(
    sameOrigin(
      new Request('https://notes.example.org/api/auth/login', {
        method: 'POST',
        headers: { origin: policy.origin },
      }),
      policy,
    ),
  ).toBe(true);
  expect(
    sameOrigin(
      new Request('https://notes.example.org/api/auth/login', {
        method: 'POST',
        headers: { origin: policy.origin, 'sec-fetch-site': 'cross-site' },
      }),
      policy,
    ),
  ).toBe(false);
  expect(
    sameOrigin(
      new Request('https://notes.example.org/api/auth/login', {
        method: 'OPTIONS',
        headers: { origin: policy.origin },
      }),
      policy,
    ),
  ).toBe(false);
});
it('public allowlist is exact, method-aware, and never includes files/backups/registration', () => {
  expect(isPublicAuthRoute('/api/auth/login', 'POST')).toBe(true);
  expect(isPublicAuthRoute('/api/auth/mfa', 'POST')).toBe(true);
  expect(isPublicAuthRoute('/api/auth/mfa', 'GET')).toBe(false);
  expect(isPublicAuthRoute('/api/auth/fresh', 'POST')).toBe(false);
  expect(isPublicAuthRoute('/api/auth/security', 'POST')).toBe(false);
  expect(isPublicAuthRoute('/api/auth/recover', 'POST')).toBe(false);
  expect(isPublicAuthRoute('/setup', 'GET')).toBe(true);
  for (const path of [
    '/setup/',
    '/api/auth/setup/extra',
    '/api/auth/register',
    '/files/id/display.webp',
    '/backups/id',
    '/settings',
  ])
    expect(isPublicAuthRoute(path, 'GET')).toBe(false);
  expect(isPublicAuthRoute('/health', 'POST')).toBe(false);
  expect(usesUnauthorizedResponse('/files/id/display.webp', 'GET')).toBe(true);
  expect(usesUnauthorizedResponse('/notes/id', 'GET')).toBe(false);
});
