import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { attachmentErrorResponse } from '#lib/server/attachments/http.ts';

export const GET: RequestHandler = async ({ locals, params, url, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    return await locals.runtime!.attachments.download(
      locals.identity,
      params.attachmentId,
      params.variant,
      url.searchParams.get('download') === '1',
      request.method === 'HEAD',
    );
  } catch (error) {
    return attachmentErrorResponse(error);
  }
};
export const HEAD = GET;
