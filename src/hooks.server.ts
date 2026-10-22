import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building, dev } from '$app/env';
import { setupAccess } from '#lib/server/auth/setup-routing.ts';
import { appearanceFrom, appearanceHtml } from '#lib/shared/appearance.ts';
import { apiError } from '#lib/shared/domain.ts';
import { DEFAULT_SETTINGS } from '#lib/shared/settings.ts';
import { matchAcceptLanguage } from '#lib/shared/i18n/registry.ts';
import { readSettings } from '#lib/server/settings/repository.ts';
import { vaultState } from '#lib/server/auth/vault.ts';
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
  response.headers.set(
    'permissions-policy',
    'geolocation=(), microphone=(self)',
  );
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
  let readVaultVersion: number | undefined;
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
          { ok: false, error: apiError('busy', 'err.restoreMaintenance') },
          { status: 503 },
        ),
      );
    if (!sameOrigin(event.request, runtime.policy))
      return protect(
        Response.json(
          {
            ok: false,
            error: apiError('unauthorized', 'err.sameOrigin'),
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
    if (event.locals.identity && ['GET', 'HEAD'].includes(method))
      readVaultVersion = vaultState(
        runtime.persistence.db,
        event.locals.identity,
      ).version;
    if (cookie && !event.locals.identity)
      clearSessionCookie(event.cookies, runtime.policy.production);
    const setupState = runtime.auth.setupState();
    const access = setupAccess(
      setupState,
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
            error: apiError(
              access.code,
              access.code === 'already_set_up'
                ? 'setup.alreadySetUp'
                : access.code === 'setup_required'
                  ? 'err.finishSetup'
                  : 'err.signInToContinue',
            ),
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
              error: apiError('unauthorized', 'err.signInToContinue'),
            },
            { status: 401 },
          ),
        );
      return protect(
        new Response(null, { status: 303, headers: { location: '/login' } }),
      );
    }
    const settings = readSettings(runtime.persistence);
    event.locals.appearance = appearanceFrom(
      event.locals.identity ? settings : DEFAULT_SETTINGS,
    );
    // Before setup completes only the browser can express a preference; afterwards
    // every page, including the public sign-in page, uses the saved values.
    event.locals.i18n = {
      language:
        setupState === 'complete'
          ? settings.language
          : matchAcceptLanguage(event.request.headers.get('accept-language')),
      siteTitle: settings.siteTitle,
      tagline: settings.tagline,
    };
  } catch (error) {
    return protect(authErrorResponse(error));
  }
  const response = await resolve(event, {
    // Language codes come only from the code registry; safe for the attribute.
    transformPageChunk: ({ html }) =>
      appearanceHtml(
        html,
        event.locals.appearance!,
        event.locals.i18n?.language,
      ),
  });
  if (readVaultVersion !== undefined) {
    try {
      if (
        vaultState(event.locals.runtime!.persistence.db, event.locals.identity!)
          .version !== readVaultVersion
      )
        return protect(
          Response.json(
            { ok: false, error: apiError('busy', 'vault.changed') },
            { status: 409 },
          ),
        );
    } catch (error) {
      return protect(authErrorResponse(error));
    }
  }
  return protect(response);
};
