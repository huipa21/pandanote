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
import { flattenTagTree } from '#lib/shared/tag-tree.ts';
import { tagSuggestionList, type TagChange } from '#lib/shared/tags.ts';

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
  const db = locals.runtime!.persistence.db;
  const availableTags = publishedTags(
    locals.runtime!.persistence,
    locals.identity!,
  );
  return {
    calendar: monthActivity(
      locals.runtime!.persistence,
      locals.identity!,
      month,
    ),
    account: locals.identity!.account,
    timezone: settings.timezone,
    storageLimits: storageLimitsFrom(settings),
    // Registry paths plus implicit parents, minus subtree-aware retired history.
    tagSuggestions: tagSuggestionList(
      db.all<{ key: string; display: string }>(
        sql`select normalized_key as key, display from tags order by normalized_key limit 5000`,
      ),
      db.all<TagChange>(
        sql`select generation, old_key as oldKey, action, target_key as targetKey, scope from tag_changes order by generation`,
      ),
      new Map(flattenTagTree(availableTags).map((n) => [n.key, n.count])),
    ).slice(0, 5000),
    tagGeneration: db.get<{ generation: number }>(
      sql`select coalesce(max(generation),0) as generation from tag_changes`,
    )!.generation,
    availableTags,
  };
};
