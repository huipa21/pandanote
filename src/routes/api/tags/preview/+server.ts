import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    return Response.json({
      ok: true,
      data: locals.runtime!.tags.preview(
        locals.identity,
        await readNoteJson(request, 4096),
      ),
    });
  } catch (error) {
    return noteErrorResponse(
      error,
      'Tag preview failed. No changes made; retry.',
    );
  }
};
