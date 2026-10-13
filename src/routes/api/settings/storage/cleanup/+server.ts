import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { readNoteJson, noteErrorResponse } from '#lib/server/notes/http.ts';
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json({
      ok: true,
      data: await locals.runtime!.attachments.cleanupUnused(
        locals.identity,
        await readNoteJson(request, 4096),
      ),
    });
  } catch (error) {
    return noteErrorResponse(error, 'err.cleanupFailed');
  }
};
