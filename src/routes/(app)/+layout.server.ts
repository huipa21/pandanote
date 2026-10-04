import type { LayoutServerLoad } from './$types';
import { readSettings } from '#lib/server/settings/repository.ts';

export const load: LayoutServerLoad = ({ locals }) => ({
  account: locals.identity!.account,
  timezone: readSettings(locals.runtime!.persistence).timezone,
});
