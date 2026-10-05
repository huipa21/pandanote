import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { monthActivity } from '#lib/server/calendar/activity.ts';
import { noteErrorResponse } from '#lib/server/notes/http.ts';
export const GET: RequestHandler = ({ locals, url }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    if (
      url.searchParams.toString().length > 100 ||
      url.searchParams.getAll('month').length !== 1 ||
      [...url.searchParams.keys()].some((k) => k !== 'month')
    )
      throw new DomainError('validation', 'Choose one calendar month.');
    return Response.json({
      ok: true,
      data: monthActivity(
        locals.runtime!.persistence,
        locals.identity,
        url.searchParams.get('month')!,
      ),
    });
  } catch (error) {
    return noteErrorResponse(
      error,
      'Activity could not be loaded. Retry in a moment.',
    );
  }
};
