import { BlockList, isIP } from 'node:net';
import { DomainError } from '../../shared/domain.ts';

export class StartupConfigurationError extends Error {}
/** 'private': built-in private/loopback peers (default). null: never read XFF. */
export type TrustedPeers = 'private' | BlockList | null;
export interface AuthPolicy {
  origin: string;
  production: boolean;
  trustedPeers: TrustedPeers;
}
export const MAX_TRUSTED_PROXY_ENTRIES = 32;
const TRUSTED_PROXIES_MESSAGE =
  'TRUSTED_PROXIES must be none or a comma-separated list of IP addresses/CIDRs';
/** Splits a raw TRUSTED_PROXIES value into trimmed entries (empty array = default). */
export function trustedProxyEntries(raw: string | undefined): string[] {
  const value = raw?.trim() ?? '';
  if (value === '' || value.toLowerCase() === 'none') return [];
  return value.split(',').map((entry) => entry.trim());
}
export function parseTrustedPeers(raw: string | undefined): TrustedPeers {
  const value = raw?.trim() ?? '';
  if (value === '') return 'private';
  if (value.toLowerCase() === 'none') return null;
  const entries = trustedProxyEntries(value);
  if (entries.length > MAX_TRUSTED_PROXY_ENTRIES)
    throw new StartupConfigurationError(TRUSTED_PROXIES_MESSAGE);
  const list = new BlockList();
  for (const entry of entries) {
    const [address, prefixText, ...extra] = entry.split('/');
    const family = isIP(address ?? '');
    if (!family || extra.length > 0 || entry.includes('%'))
      throw new StartupConfigurationError(TRUSTED_PROXIES_MESSAGE);
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefixText === undefined) {
      list.addAddress(address!, type);
      continue;
    }
    const maxPrefix = family === 4 ? 32 : 128;
    if (
      !/^(0|[1-9]\d{0,2})$/.test(prefixText) ||
      Number(prefixText) > maxPrefix
    )
      throw new StartupConfigurationError(TRUSTED_PROXIES_MESSAGE);
    list.addSubnet(address!, Number(prefixText), type);
  }
  return list;
}
export function authPolicy(
  env: NodeJS.ProcessEnv,
  development = false,
): AuthPolicy {
  const value =
    env.ORIGIN ??
    (env.NODE_ENV === 'production'
      ? undefined
      : `http://localhost:${development ? 5173 : 3000}`);
  if (!value)
    throw new StartupConfigurationError(
      'ORIGIN must be set in production (https://your-domain, no trailing slash).',
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new StartupConfigurationError(
      'ORIGIN must be a canonical HTTP(S) origin',
    );
  }
  if (
    value !== url.origin ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !['https:', 'http:'].includes(url.protocol)
  )
    throw new StartupConfigurationError(
      'ORIGIN must be a canonical HTTP(S) origin',
    );
  if (
    url.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new StartupConfigurationError(
      'HTTP is permitted only on loopback development/test origins',
    );
  // Keep Kit's client-address source the actual TCP peer. Apply private-network
  // trust here, never through adapter-wide forwarding overrides.
  if (
    env.ADDRESS_HEADER ||
    env.HOST_HEADER ||
    env.PROTOCOL_HEADER ||
    env.PORT_HEADER
  )
    throw new StartupConfigurationError(
      'Adapter forwarding overrides are unsupported; configure ORIGIN only',
    );
  return {
    origin: url.origin,
    production: env.NODE_ENV === 'production',
    trustedPeers: parseTrustedPeers(env.TRUSTED_PROXIES),
  };
}
const privatePeers = new BlockList();
for (const [address, prefix] of [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16],
] as const)
  privatePeers.addSubnet(address, prefix, 'ipv4');
privatePeers.addAddress('::1', 'ipv6');
privatePeers.addSubnet('fc00::', 7, 'ipv6');
privatePeers.addSubnet('fe80::', 10, 'ipv6');

export function clientIp(
  peer: string,
  headers: Headers,
  policy: Pick<AuthPolicy, 'trustedPeers'>,
): string {
  const family = isIP(peer);
  if (!family) throw new DomainError('validation', 'Invalid client address.');
  // BlockList handles mapped IPv4 (including hex notation) against IPv4 ranges.
  // A trusted peer must overwrite XFF: never guess a first/last hop from a chain.
  const trusted = policy.trustedPeers;
  if (trusted === null) return peer;
  const list = trusted === 'private' ? privatePeers : trusted;
  if (!list.check(peer, family === 4 ? 'ipv4' : 'ipv6')) return peer;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded === null) return peer;
  if (!isIP(forwarded))
    throw new DomainError('validation', 'Invalid proxy client address.');
  return forwarded;
}
export function sameOrigin(request: Request, policy: AuthPolicy): boolean {
  // GET/HEAD only; OPTIONS does not enable CORS or mutate application state.
  return (
    ['GET', 'HEAD'].includes(request.method) ||
    (request.method !== 'OPTIONS' &&
      request.headers.get('origin') === policy.origin &&
      request.headers.get('sec-fetch-site') !== 'cross-site')
  );
}
export function isPublicAuthRoute(path: string, method: string): boolean {
  return (
    (['GET', 'HEAD'].includes(method) &&
      ['/health', '/setup', '/login'].includes(path)) ||
    (method === 'POST' &&
      ['/api/setup/account', '/api/auth/login', '/api/auth/mfa'].includes(path))
  );
}
export function usesUnauthorizedResponse(
  path: string,
  method: string,
): boolean {
  return (
    !['GET', 'HEAD'].includes(method) ||
    ['/api/', '/files/', '/attachments/', '/backups/'].some((prefix) =>
      path.startsWith(prefix),
    )
  );
}
