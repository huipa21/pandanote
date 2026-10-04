import type { Handle } from '@sveltejs/kit/hooks';
import { appearanceFrom, appearanceHtml } from '#lib/shared/appearance.ts';
import { DEFAULT_SETTINGS } from '#lib/shared/settings.ts';
import { readSettings } from '#lib/server/settings/repository.ts';
import { getRuntime } from '#lib/server/runtime.ts';
import {
  clientIp,
  isPublicAuthRoute,
  sameOrigin,
  usesUnauthorizedResponse,
} from '#lib/server/auth/policy.ts';
import {
  SESSION_COOKIE,
  authErrorResponse,
  clearSessionCookie,
} from '#lib/server/auth/http.ts';

function protect(response: Response): Response {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'same-origin');
  response.headers.set('x-frame-options', 'DENY');
  if (!response.headers.has('content-security-policy'))
    response.headers.set(
      'content-security-policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
  return response;
}
export const handle: Handle = async ({ event, resolve }) => {
  event.locals.identity = null;
  const path = event.url.pathname;
  const method = event.request.method;
  // Liveness is public, read-only and contains no readiness/account metadata.
  if (path === '/health' && ['GET', 'HEAD'].includes(method))
    return protect(await resolve(event));
  try {
    const runtime = getRuntime();
    await runtime.ready;
    event.locals.runtime = runtime;
    if (!sameOrigin(event.request, runtime.policy))
      return protect(
        Response.json(
          {
            ok: false,
            error: {
              code: 'unauthorized',
              message: 'Same-origin request required.',
            },
          },
          { status: 403 },
        ),
      );
    event.locals.clientIp = clientIp(
      event.getClientAddress(),
      event.request.headers,
      runtime.policy,
    );
    const cookie = event.cookies.get(SESSION_COOKIE);
    event.locals.identity = runtime.auth.authenticate(cookie);
    if (cookie && !event.locals.identity)
      clearSessionCookie(event.cookies, runtime.policy.production);
    if (!event.locals.identity && !isPublicAuthRoute(path, method)) {
      if (usesUnauthorizedResponse(path, method))
        return protect(
          Response.json(
            {
              ok: false,
              error: { code: 'unauthorized', message: 'Sign in to continue.' },
            },
            { status: 401 },
          ),
        );
      return protect(
        new Response(null, { status: 303, headers: { location: '/login' } }),
      );
    }
    event.locals.appearance = appearanceFrom(
      event.locals.identity
        ? readSettings(runtime.persistence)
        : DEFAULT_SETTINGS,
    );
  } catch (error) {
    return protect(authErrorResponse(error));
  }
  return protect(
    await resolve(event, {
      transformPageChunk: ({ html }) =>
        appearanceHtml(html, event.locals.appearance!),
    }),
  );
};
