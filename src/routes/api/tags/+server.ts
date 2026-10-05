import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';
export const GET: RequestHandler = ({ locals, url }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    if (
      url.search.length > 2048 ||
      [...url.searchParams.keys()].some((k) => k !== 'q') ||
      url.searchParams.getAll('q').length > 1
    )
      throw new DomainError('validation', 'Invalid tag search.');
    return Response.json({
      ok: true,
      data: locals.runtime!.tags.list(
        locals.identity,
        url.searchParams.get('q') ?? '',
      ),
    });
  } catch (error) {
    return noteErrorResponse(error, 'Tags could not be loaded. Retry.');
  }
};
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    return Response.json({
      ok: true,
      data: locals.runtime!.tags.execute(
        locals.identity,
        await readNoteJson(request, 64 * 1024),
      ),
    });
  } catch (error) {
    return noteErrorResponse(
      error,
      'Tag operation could not be confirmed. Retry the same operation safely.',
    );
  }
};
