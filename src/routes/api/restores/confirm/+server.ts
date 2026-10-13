import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { readNoteJson } from '#lib/server/notes/http.ts';
import { backupErrorResponse } from '#lib/server/backups/http.ts';
import { clearSessionCookie } from '#lib/server/auth/http.ts';
export const POST: RequestHandler = async ({ locals, request, cookies }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    await locals.runtime!.restores.confirm(
      locals.identity,
      await readNoteJson(request, 4096),
    );
    clearSessionCookie(cookies, locals.runtime!.policy.production);
    return Response.json({ ok: true, data: { loginRequired: true } });
  } catch (error) {
    return backupErrorResponse(error);
  }
};
