import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { noteMutationSchema } from '#lib/shared/notes.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';

export const POST: RequestHandler = async ({ locals, params, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    const value = noteMutationSchema.safeParse(await readNoteJson(request));
    if (
      !value.success ||
      value.data.action === 'create' ||
      value.data.action === 'update' ||
      value.data.noteId !== params.noteId
    )
      throw new DomainError(
        'validation',
        'Use a lifecycle action for this note.',
      );
    return Response.json({
      ok: true,
      data: locals.runtime!.notes.mutate(locals.identity, value.data),
    });
  } catch (error) {
    return noteErrorResponse(error);
  }
};
