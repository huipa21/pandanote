import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { attachmentErrorResponse } from '#lib/server/attachments/http.ts';

/** Rename a saved voice clip: `{ "filename": "New name.webm" }`. */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    const length = request.headers.get('content-length');
    if (
      request.headers.get('content-type')?.split(';')[0].trim() !==
        'application/json' ||
      (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096))
    )
      throw new DomainError('validation', 'err.invalidClipName');
    let body: unknown;
    try {
      body = JSON.parse((await request.text()).slice(0, 4096));
    } catch {
      throw new DomainError('validation', 'err.invalidClipName');
    }
    return Response.json(
      {
        ok: true,
        data: locals.runtime!.attachments.rename(
          locals.identity,
          params.attachmentId,
          body,
        ),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return attachmentErrorResponse(error);
  }
};
