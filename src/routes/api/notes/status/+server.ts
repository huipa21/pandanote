import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { statusPage } from '#lib/server/notes/status-list.ts';
import { noteErrorResponse } from '#lib/server/notes/http.ts';
export const GET: RequestHandler = ({ locals, url }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json({
      ok: true,
      data: statusPage(
        locals.runtime!.persistence,
        locals.identity,
        url.searchParams,
      ),
    });
  } catch (error) {
    return noteErrorResponse(error, 'err.trashLoadFailed');
  }
};
