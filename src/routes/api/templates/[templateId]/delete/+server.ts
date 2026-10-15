import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { templateCommandSchema } from '#lib/shared/templates.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';

export const POST: RequestHandler = async ({ locals, params, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    const command = templateCommandSchema.safeParse(
      await readNoteJson(request),
    );
    if (
      !command.success ||
      command.data.action !== 'delete' ||
      command.data.templateId !== params.templateId
    )
      throw new DomainError('validation', 'err.templateRequestInvalid');
    return Response.json({
      ok: true,
      data: locals.runtime!.templates.mutate(locals.identity, command.data),
    });
  } catch (error) {
    return noteErrorResponse(error, 'err.templateSaveFailed');
  }
};
