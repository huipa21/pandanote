import { expect, it } from 'vitest';
import {
  authTokenSchema,
  passwordSchema,
  setupRequestSchema,
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
    setupRequestSchema.safeParse({
      token: 'a'.repeat(43),
      password: 'a'.repeat(12),
      admin: true,
    }).success,
  ).toBe(false);
});
it('requires a configured origin, HTTPS outside loopback and explicit proxy trust', () => {
  expect(() => authPolicy({})).toThrow(/ORIGIN/);
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
  expect(() =>
    authPolicy({ ORIGIN: 'https://notes.example.org', TRUSTED_PROXY_IPS: '*' }),
  ).toThrow();
});
it('ignores spoofed headers from untrusted peers and accepts only an overwritten single IP from a trusted edge', () => {
  const policy = authPolicy({
    ORIGIN: 'https://notes.example.org',
    TRUSTED_PROXY_IPS: '127.0.0.1,::1',
  });
  const headers = new Headers({
    'x-forwarded-for': '198.51.100.20',
    'x-forwarded-host': 'attacker.invalid',
  });
  expect(clientIp('192.0.2.3', headers, policy)).toBe('192.0.2.3');
  expect(clientIp('127.0.0.1', headers, policy)).toBe('198.51.100.20');
  headers.set('x-forwarded-for', '198.51.100.20, 192.0.2.3');
  expect(() => clientIp('127.0.0.1', headers, policy)).toThrow(/proxy/);
  expect(() => clientIp('127.0.0.1', new Headers(), policy)).toThrow(/proxy/);
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
