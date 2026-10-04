import type { LayoutServerLoad } from './$types';
import { readSettings } from '#lib/server/settings/repository.ts';
import { publishedTags } from '#lib/server/notes/timeline.ts';

export const load: LayoutServerLoad = ({ locals, depends }) => {
  depends('pandanote:timeline');
  return {
    account: locals.identity!.account,
    timezone: readSettings(locals.runtime!.persistence).timezone,
    availableTags: publishedTags(locals.runtime!.persistence, locals.identity!),
  };
};
