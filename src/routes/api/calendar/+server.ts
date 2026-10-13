import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { monthActivity, yearActivity } from '#lib/server/calendar/activity.ts';
import { noteErrorResponse } from '#lib/server/notes/http.ts';
export const GET: RequestHandler = ({ locals, url }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    if (url.searchParams.has('year')) {
      if (
        url.searchParams.toString().length > 100 ||
        url.searchParams.getAll('year').length !== 1 ||
        [...url.searchParams.keys()].some((k) => k !== 'year')
      )
        throw new DomainError('validation', 'err.chooseOneCalendarYear');
      const year = Number(url.searchParams.get('year'));
      if (!Number.isInteger(year) || year < 1969 || year > 9998)
        throw new DomainError('validation', 'err.chooseAYearBetween1969');
      return Response.json({
        ok: true,
        data: yearActivity(locals.runtime!.persistence, locals.identity, year),
      });
    }
    if (
      url.searchParams.toString().length > 100 ||
      url.searchParams.getAll('month').length !== 1 ||
      [...url.searchParams.keys()].some((k) => k !== 'month')
    )
      throw new DomainError('validation', 'err.chooseOneCalendarMonth');
    return Response.json({
      ok: true,
      data: monthActivity(
        locals.runtime!.persistence,
        locals.identity,
        url.searchParams.get('month')!,
      ),
    });
  } catch (error) {
    return noteErrorResponse(error, 'err.activityLoadFailed');
  }
};
