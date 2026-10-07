import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building, dev } from '$app/env';
import { setupAccess } from '#lib/server/auth/setup-routing.ts';
import { appearanceFrom, appearanceHtml } from '#lib/shared/appearance.ts';
import { DEFAULT_SETTINGS } from '#lib/shared/settings.ts';
import { readSettings } from '#lib/server/settings/repository.ts';
import { getRuntime, initializeRuntime } from '#lib/server/runtime.ts';
import { ApplicationInitializationError } from '#lib/server/initialize.ts';
import {
  StartupConfigurationError,
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

// Adapter-node's handler awaits server.init before index.js calls listen. Builds
// must never initialize storage. Vite also awaits init before invoking our handle.
export const init: ServerInit = async () => {
  if (!building) {
    try {
      await initializeRuntime(dev);
    } catch (error) {
      // Kit logs thrown errors, so discard native causes at this outer boundary.
      // eslint-disable-next-line preserve-caught-error -- native causes may disclose private paths/SQL
      throw new Error(
        error instanceof ApplicationInitializationError ||
          error instanceof StartupConfigurationError
          ? error.message
          : 'PandaNote startup failed. Check private storage and recovery.',
      );
    }
  }
};

function protect(response: Response): Response {
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'same-origin');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('permissions-policy', 'geolocation=(self)');
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
  // Readiness is public, read-only and contains no private/account metadata.
  if (path === '/health' && ['GET', 'HEAD'].includes(method))
    return protect(await resolve(event));
  try {
    const runtime = getRuntime();
    await runtime.ready;
    event.locals.runtime = runtime;
    if (!runtime.persistence.available)
      return protect(
        Response.json(
          {
            ok: false,
            error: {
              code: 'busy',
              message: 'Restore maintenance is in progress. Retry shortly.',
            },
          },
          { status: 503 },
        ),
      );
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
    );
    const cookie = event.cookies.get(SESSION_COOKIE);
    event.locals.identity = runtime.auth.authenticate(cookie);
    if (cookie && !event.locals.identity)
      clearSessionCookie(event.cookies, runtime.policy.production);
    const access = setupAccess(
      runtime.auth.setupState(),
      !!event.locals.identity,
      path,
      method,
    );
    if (access) {
      if ('redirect' in access)
        return protect(
          new Response(null, {
            status: 303,
            headers: { location: access.redirect },
          }),
        );
      return protect(
        Response.json(
          {
            ok: false,
            error: {
              code: access.code,
              message:
                access.code === 'already_set_up'
                  ? 'An account already exists. Sign in to continue.'
                  : access.code === 'setup_required'
                    ? 'Finish setup to continue.'
                    : 'Sign in to continue.',
            },
          },
          { status: access.status },
        ),
      );
    }
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
