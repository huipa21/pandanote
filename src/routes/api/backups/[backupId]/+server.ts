import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { readNoteJson } from '#lib/server/notes/http.ts';
import { backupErrorResponse } from '#lib/server/backups/http.ts';
export const DELETE: RequestHandler = async ({ locals, request, params }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    await locals.runtime!.backups.delete(
      locals.identity,
      params.backupId,
      await readNoteJson(request, 4096),
    );
    return Response.json({ ok: true });
  } catch (error) {
    return backupErrorResponse(error);
  }
};
