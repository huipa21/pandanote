import type { Cookies } from '@sveltejs/kit';
import { DomainError, apiError, type ApiError } from '../../shared/domain.ts';
import type { SessionCredential } from './service.ts';
import { DEVICE_COOKIE } from './device-trust.ts';
import { RateLimitError } from './rate-limits.ts';

export const SESSION_COOKIE = 'pandanote_session';
export function setSessionCookie(
  cookies: Cookies,
  credential: SessionCredential,
  production: boolean,
): void {
  cookies.set(SESSION_COOKIE, credential.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: production,
    expires: new Date(credential.expiresAt),
  });
  // Rate-limit marker only, never authentication. Scoped to the credential endpoints.
  if (credential.device)
    cookies.set(DEVICE_COOKIE, credential.device.token, {
      path: '/api/auth',
      httpOnly: true,
      sameSite: 'strict',
      secure: production,
      expires: new Date(credential.device.expiresAt),
    });
}
export function clearSessionCookie(
  cookies: Cookies,
  production: boolean,
): void {
  cookies.delete(SESSION_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: production,
  });
}
export async function readAuthJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
    'application/json'
  )
    throw new DomainError('validation', 'err.useAnApplicationJsonRequest');
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 4096))
    throw new DomainError('validation', 'err.authenticationRequestIsTooLarge');
  if (!request.body)
    throw new DomainError('validation', 'err.missingRequestBody');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        throw new DomainError(
          'validation',
          'err.authenticationRequestIsTooLarge',
        );
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('validation', 'err.invalidAuthenticationRequest');
  } finally {
    reader.releaseLock();
  }
}
export function authErrorResponse(error: unknown): Response {
  const known = error instanceof DomainError;
  const body: ApiError = known
    ? error.toApiError()
    : apiError('busy', 'err.authUnavailable');
  const retryAfter =
    error instanceof RateLimitError ? error.retryAfterSeconds : 900;
  const status = ['setup_required', 'already_set_up'].includes(body.code)
    ? 409
    : body.code === 'setup_closed'
      ? 403
      : body.code === 'fresh-auth-required'
        ? 403
        : body.code === 'conflict'
          ? 409
          : body.code === 'unauthorized' || body.code === 'mfa_restart'
            ? 401
            : body.code === 'rate-limited'
              ? 429
              : body.code === 'validation'
                ? 400
                : 503;
  return Response.json(
    { ok: false, error: body },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        ...(status === 429 ? { 'retry-after': String(retryAfter) } : {}),
      },
    },
  );
}
