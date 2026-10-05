import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { readNoteJson } from '#lib/server/notes/http.ts';
import { backupErrorResponse } from '#lib/server/backups/http.ts';
export const GET: RequestHandler = ({ locals, url }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    if (url.search)
      throw new DomainError('validation', 'Unexpected backup query.');
    return Response.json({
      ok: true,
      data: locals.runtime!.backups.list(locals.identity),
    });
  } catch (error) {
    return backupErrorResponse(error);
  }
};
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    return Response.json(
      {
        ok: true,
        data: locals.runtime!.backups.create(
          locals.identity,
          await readNoteJson(request, 4096),
        ),
      },
      { status: 202 },
    );
  } catch (error) {
    return backupErrorResponse(error);
  }
};
