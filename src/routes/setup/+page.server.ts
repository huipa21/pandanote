import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals }) => ({
  windowOpen: locals.runtime!.auth.setupWindowOpen(),
});
