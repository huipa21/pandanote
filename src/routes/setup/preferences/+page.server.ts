import type { PageServerLoad } from './$types';
import { readSettings } from '#lib/server/settings/repository.ts';
export const load: PageServerLoad = ({ locals }) => ({
  siteTitle: readSettings(locals.runtime!.persistence).siteTitle,
});
