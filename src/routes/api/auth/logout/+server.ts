import type { RequestHandler } from './$types';
import {
  authErrorResponse,
  clearSessionCookie,
} from '#lib/server/auth/http.ts';

export const POST: RequestHandler = ({ locals, cookies }) => {
  try {
    const runtime = locals.runtime!;
    runtime.auth.logout(locals.identity!);
    clearSessionCookie(cookies, runtime.policy.production);
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
};
