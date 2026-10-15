import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { templateCommandSchema } from '#lib/shared/templates.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';

export const GET: RequestHandler = ({ locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json({
      ok: true,
      data: locals.runtime!.templates.list(locals.identity),
    });
  } catch (error) {
    return noteErrorResponse(error, 'err.templateLoadFailed');
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    const command = templateCommandSchema.safeParse(
      await readNoteJson(request),
    );
    if (!command.success || command.data.action !== 'create')
      throw new DomainError('validation', 'err.templateRequestInvalid');
    return Response.json({
      ok: true,
      data: locals.runtime!.templates.mutate(locals.identity, command.data),
    });
  } catch (error) {
    return noteErrorResponse(error, 'err.templateSaveFailed');
  }
};
