import { isIP } from 'node:net';
import { DomainError } from '../../shared/domain.ts';

export interface AuthPolicy {
  origin: string;
  production: boolean;
  trustedProxyIps: string[];
}
export function authPolicy(env: NodeJS.ProcessEnv): AuthPolicy {
  if (!env.ORIGIN) throw new Error('ORIGIN must be explicitly configured');
  const url = new URL(env.ORIGIN);
  if (
    env.ORIGIN !== url.origin ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !['https:', 'http:'].includes(url.protocol)
  )
    throw new Error('ORIGIN must be a canonical HTTP(S) origin');
  if (
    url.protocol === 'http:' &&
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    throw new Error(
      'HTTP is permitted only on loopback development/test origins',
    );
  // Keep Kit's client-address source the actual peer. Proxy trust is explicit
  // here rather than allowing attacker-controlled forwarding headers globally.
  if (
    env.ADDRESS_HEADER ||
    env.HOST_HEADER ||
    env.PROTOCOL_HEADER ||
    env.PORT_HEADER
  )
    throw new Error(
      'Adapter forwarding overrides are unsupported; configure ORIGIN and TRUSTED_PROXY_IPS',
    );
  const trustedProxyIps = (env.TRUSTED_PROXY_IPS ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (trustedProxyIps.length > 16 || trustedProxyIps.some((ip) => !isIP(ip)))
    throw new Error(
      'TRUSTED_PROXY_IPS must contain at most 16 exact IP addresses',
    );
  return {
    origin: url.origin,
    production: env.NODE_ENV === 'production',
    trustedProxyIps,
  };
}
export function clientIp(
  peer: string,
  headers: Headers,
  policy: AuthPolicy,
): string {
  if (!isIP(peer))
    throw new DomainError('validation', 'Invalid client address.');
  if (!policy.trustedProxyIps.includes(peer)) return peer;
  // The configured edge MUST overwrite X-Forwarded-For with one address.
  // Chains, invalid values and missing headers fail closed, not first/last guesses.
  const forwarded = headers.get('x-forwarded-for');
  if (!forwarded || !isIP(forwarded))
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
      ['/api/auth/setup', '/api/auth/login', '/api/auth/mfa'].includes(path))
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
