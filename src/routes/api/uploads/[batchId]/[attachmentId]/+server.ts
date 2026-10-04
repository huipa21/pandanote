import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { attachmentErrorResponse } from '#lib/server/attachments/http.ts';

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    const data = await locals.runtime!.attachments.upload(
      locals.identity,
      params.batchId,
      params.attachmentId,
      request,
    );
    return Response.json({ ok: true, data });
  } catch (error) {
    return attachmentErrorResponse(error);
  }
};
