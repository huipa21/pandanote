import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import {
  attachmentErrorResponse,
  readBatchJson,
} from '#lib/server/attachments/http.ts';

export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    const data = locals.runtime!.attachments.initialize(
      locals.identity,
      await readBatchJson(request),
    );
    return Response.json({ ok: true, data });
  } catch (error) {
    return attachmentErrorResponse(error);
  }
};
