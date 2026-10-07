import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
  appearance: locals.appearance!,
  i18n: locals.i18n!,
});
