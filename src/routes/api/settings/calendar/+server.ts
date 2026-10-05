import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { readAuthJson } from '#lib/server/auth/http.ts';
import { noteErrorResponse } from '#lib/server/notes/http.ts';
import { updateCalendar } from '#lib/server/settings/repository.ts';
export const PATCH: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    return Response.json({
      ok: true,
      data: updateCalendar(
        locals.runtime!.persistence,
        locals.identity,
        await readAuthJson(request),
      ),
    });
  } catch (error) {
    return noteErrorResponse(
      error,
      'Calendar settings could not be saved. Retry.',
    );
  }
};
