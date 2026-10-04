import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { noteMutationSchema } from '#lib/shared/notes.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    const value = noteMutationSchema.safeParse(await readNoteJson(request));
    if (!value.success || value.data.action !== 'create')
      throw new DomainError('validation', 'Use a create-note request.');
    const data = locals.runtime!.notes.mutate(locals.identity, value.data);
    return Response.json({ ok: true, data });
  } catch (error) {
    return noteErrorResponse(error);
  }
};
