import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';
export const GET: RequestHandler = ({ locals, url }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    if (
      url.search.length > 2048 ||
      [...url.searchParams.keys()].some(
        (k) => !['q', 'offset', 'limit'].includes(k),
      ) ||
      ['q', 'offset', 'limit'].some(
        (k) => url.searchParams.getAll(k).length > 1,
      )
    )
      throw new DomainError('validation', 'err.invalidTagSearch');
    const number = (name: string, fallback: number, max: number) => {
      const raw = url.searchParams.get(name);
      if (raw === null) return fallback;
      if (!/^\d{1,6}$/.test(raw) || Number(raw) > max)
        throw new DomainError('validation', 'err.invalidTagSearch');
      return Number(raw);
    };
    return Response.json({
      ok: true,
      data: locals.runtime!.tags.page(
        locals.identity,
        url.searchParams.get('q') ?? '',
        number('offset', 0, 100_000),
        Math.max(1, number('limit', 60, 200)),
      ),
    });
  } catch (error) {
    return noteErrorResponse(error, 'err.tagsLoadFailed');
  }
};
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json({
      ok: true,
      data: locals.runtime!.tags.execute(
        locals.identity,
        await readNoteJson(request, 64 * 1024),
      ),
    });
  } catch (error) {
    return noteErrorResponse(error, 'err.tagOperationUnconfirmed');
  }
};
