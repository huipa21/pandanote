import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { noteMutationSchema } from '#lib/shared/notes.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';

export const GET: RequestHandler = ({ locals, params }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json({
      ok: true,
      data: locals.runtime!.notes.get(locals.identity, params.noteId),
    });
  } catch (error) {
    return noteErrorResponse(error);
  }
};
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    const value = noteMutationSchema.safeParse(await readNoteJson(request));
    if (
      !value.success ||
      value.data.action !== 'update' ||
      value.data.noteId !== params.noteId
    )
      throw new DomainError('validation', 'err.useAnUpdateRequestFor');
    return Response.json({
      ok: true,
      data: locals.runtime!.notes.mutate(locals.identity, value.data),
    });
  } catch (error) {
    return noteErrorResponse(error);
  }
};
