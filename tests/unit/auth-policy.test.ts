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
    expect(clientIp(peer, headers), peer).toBe('198.51.100.20');
    expect(clientIp(peer, new Headers()), peer).toBe(peer);
    for (const invalid of [
      '',
      'not-an-ip',
      '198.51.100.20, 192.0.2.3',
      '198.51.100.20:123',
      '[::1]',
      '001.2.3.4',
    ])
      expect(
        () => clientIp(peer, new Headers({ 'x-forwarded-for': invalid })),
        peer,
      ).toThrow(/proxy/);
    expect(
      clientIp(peer, new Headers({ 'x-forwarded-for': '2001:db8::2' })),
    ).toBe('2001:db8::2');
  }
  for (const peer of publicIps) {
    expect(clientIp(peer, headers), peer).toBe(peer);
    expect(
      clientIp(peer, new Headers({ 'x-forwarded-for': 'invalid, chain' })),
    ).toBe(peer);
  }
  for (const peer of ['', 'invalid', '[::1]', '127.0.0.1:80'])
    expect(() => clientIp(peer, headers)).toThrow(/client address/);
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
