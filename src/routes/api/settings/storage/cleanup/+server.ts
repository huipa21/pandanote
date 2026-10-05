import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { readNoteJson, noteErrorResponse } from '#lib/server/notes/http.ts';
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    return Response.json({
      ok: true,
      data: await locals.runtime!.attachments.cleanupUnused(
        locals.identity,
        await readNoteJson(request, 4096),
      ),
    });
  } catch (error) {
    return noteErrorResponse(
      error,
      'Cleanup could not finish. Refresh storage and retry; queued deletion is retained for restart recovery.',
    );
  }
};
