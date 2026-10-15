import type { LayoutServerLoad } from './$types';
import { readSettings } from '#lib/server/settings/repository.ts';
import { monthActivity } from '#lib/server/calendar/activity.ts';
import {
  calendarMonth,
  calendarDate,
  localDate,
} from '#lib/shared/calendar.ts';
import { publishedTags } from '#lib/server/notes/timeline.ts';
import { sql } from 'drizzle-orm';
import { storageLimitsFrom } from '#lib/shared/storage.ts';

export const load: LayoutServerLoad = ({ locals, depends, url }) => {
  depends('pandanote:timeline', 'pandanote:calendar', 'pandanote:labels');
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
  const db = locals.runtime!.persistence.db;
  return {
    calendar: monthActivity(
      locals.runtime!.persistence,
      locals.identity!,
      month,
    ),
    account: locals.identity!.account,
    timezone: settings.timezone,
    storageLimits: storageLimitsFrom(settings),
    tagSuggestions: db.all<{ key: string; display: string }>(
      sql`select normalized_key as key, display from tags t where not exists (select 1 from tag_changes c where c.old_key=t.normalized_key and (c.target_key is null or c.target_key<>c.old_key)) order by normalized_key limit 5000`,
    ),
    tagGeneration: db.get<{ generation: number }>(
      sql`select coalesce(max(generation),0) as generation from tag_changes`,
    )!.generation,
    availableTags: publishedTags(locals.runtime!.persistence, locals.identity!),
    availableLabels: locals.runtime!.labels.list(locals.identity!).items,
  };
};
