import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { attachmentErrorResponse } from '#lib/server/attachments/http.ts';

export const GET: RequestHandler = ({ locals, params }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json({
      ok: true,
      data: locals.runtime!.attachments.status(locals.identity, params.batchId),
    });
  } catch (error) {
    return attachmentErrorResponse(error);
  }
};
