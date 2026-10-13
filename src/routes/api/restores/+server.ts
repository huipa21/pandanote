import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { backupErrorResponse } from '#lib/server/backups/http.ts';
export const GET: RequestHandler = ({ locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json({
      ok: true,
      data: locals.runtime!.restores.summary(locals.identity),
    });
  } catch (error) {
    return backupErrorResponse(error);
  }
};
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json({
      ok: true,
      data: await locals.runtime!.restores.upload(locals.identity, request),
    });
  } catch (error) {
    return backupErrorResponse(error);
  }
};
export const DELETE: RequestHandler = async ({ locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    await locals.runtime!.restores.discard(locals.identity);
    return Response.json({ ok: true, data: null });
  } catch (error) {
    return backupErrorResponse(error);
  }
};
