import type { PageServerLoad } from './$types';
import { readSettings } from '#lib/server/settings/repository.ts';
import { storageLimitsFrom } from '#lib/shared/storage.ts';
export const load: PageServerLoad = ({ locals }) => ({
  storageLimits: storageLimitsFrom(readSettings(locals.runtime!.persistence)),
  accountDetails: locals.runtime!.auth.accountDetails(locals.identity!),
});
