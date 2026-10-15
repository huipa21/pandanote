import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { labelCommandSchema } from '#lib/shared/labels.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';

export const POST: RequestHandler = async ({ locals, params, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    const command = labelCommandSchema.safeParse(await readNoteJson(request));
    if (
      !command.success ||
      command.data.action !== 'delete' ||
      command.data.labelId !== params.labelId
    )
      throw new DomainError('validation', 'err.labelRequestInvalid');
    return Response.json({
      ok: true,
      data: locals.runtime!.labels.mutate(locals.identity, command.data),
    });
  } catch (error) {
    return noteErrorResponse(error, 'err.labelSaveFailed');
  }
};
