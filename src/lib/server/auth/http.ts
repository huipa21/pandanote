import type { Cookies } from '@sveltejs/kit';
import { DomainError, type ApiError } from '../../shared/domain.ts';
import type { SessionCredential } from './service.ts';

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
    throw new DomainError('validation', 'Use an application/json request.');
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 4096))
    throw new DomainError('validation', 'Authentication request is too large.');
  if (!request.body)
    throw new DomainError('validation', 'Missing request body.');
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
          'Authentication request is too large.',
        );
      }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('validation', 'Invalid authentication request.');
  } finally {
    reader.releaseLock();
  }
}
export function authErrorResponse(error: unknown): Response {
  const known = error instanceof DomainError;
  const body: ApiError = known
    ? { code: error.code, message: error.message }
    : {
        code: 'busy',
        message: 'Authentication is temporarily unavailable. Please retry.',
      };
  const status = ['setup_required', 'already_set_up'].includes(body.code)
    ? 409
    : body.code === 'setup_closed'
      ? 403
      : body.code === 'fresh-auth-required'
        ? 403
        : body.code === 'conflict'
          ? 409
          : body.code === 'unauthorized'
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
        ...(status === 429 ? { 'retry-after': '900' } : {}),
      },
    },
  );
}
