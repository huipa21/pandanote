import type { LayoutServerLoad } from './$types';
import { readSettings } from '#lib/server/settings/repository.ts';
import { monthActivity } from '#lib/server/calendar/activity.ts';
import {
  calendarMonth,
  calendarDate,
  localDate,
} from '#lib/shared/calendar.ts';
import { publishedTags } from '#lib/server/notes/timeline.ts';

export const load: LayoutServerLoad = ({ locals, depends, url }) => {
  depends('pandanote:timeline', 'pandanote:calendar');
  const settings = readSettings(locals.runtime!.persistence);
  let month = localDate(Date.now(), settings.timezone).slice(0, 7);
  try {
    if (url.searchParams.has('date'))
      month = calendarDate(url.searchParams.get('date')!)
        .toString()
        .slice(0, 7);
    else if (url.searchParams.has('month'))
      month = calendarMonth(url.searchParams.get('month')!)
        .toString()
        .slice(0, 7);
  } catch {
    /* Root loader displays malformed-filter feedback. */
  }
  return {
    calendar: monthActivity(
      locals.runtime!.persistence,
      locals.identity!,
      month,
    ),
    account: locals.identity!.account,
    timezone: settings.timezone,
    availableTags: publishedTags(locals.runtime!.persistence, locals.identity!),
  };
};
