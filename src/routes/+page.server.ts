import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
  account: locals.identity!.account,
});
