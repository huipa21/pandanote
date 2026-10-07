import { isPublicAuthRoute, usesUnauthorizedResponse } from './policy.ts';
export type SetupState = 'new' | 'account' | 'complete';
export type SetupAccess =
  | { redirect: string }
  | {
      code: 'setup_required' | 'already_set_up' | 'unauthorized';
      status: number;
    }
  | null;
/** Pure central gate. Auth endpoints and logout remain usable during step two;
 * note/settings/file endpoints do not. Endpoint handlers still recheck identity. */
export function setupAccess(
  state: SetupState,
  signedIn: boolean,
  path: string,
  method: string,
): SetupAccess {
  const page = !usesUnauthorizedResponse(path, method);
  const setupApi = ['/api/setup/account', '/api/setup/preferences'].includes(
    path,
  );
  if (state === 'complete' && setupApi)
    return { code: 'already_set_up', status: 409 };
  if (state === 'new') {
    if (
      (path === '/setup' && page) ||
      (path === '/api/setup/account' && method === 'POST')
    )
      return null;
    return page
      ? { redirect: '/setup' }
      : { code: 'setup_required', status: 409 };
  }
  if (path === '/api/setup/account' && method === 'POST')
    return { code: 'already_set_up', status: 409 };
  if (state === 'account') {
    if (path === '/login' && page)
      return signedIn ? { redirect: '/setup/preferences' } : null;
    if (path === '/setup/preferences' && page)
      return signedIn ? null : { redirect: '/login' };
    if (page) return { redirect: signedIn ? '/setup/preferences' : '/login' };
    if (isPublicAuthRoute(path, method)) return null;
    if (
      signedIn &&
      ((path === '/api/setup/preferences' && method === 'POST') ||
        (path === '/api/auth/logout' && method === 'POST'))
    )
      return null;
    return signedIn
      ? { code: 'setup_required', status: 409 }
      : { code: 'unauthorized', status: 401 };
  }
  if (page && ['/setup', '/setup/preferences', '/login'].includes(path))
    return !signedIn && path === '/login'
      ? null
      : { redirect: signedIn ? '/' : '/login' };
  return null;
}
