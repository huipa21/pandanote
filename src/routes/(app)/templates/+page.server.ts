import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, depends }) => {
  depends('pandanote:templates');
  return { templates: locals.runtime!.templates.list(locals.identity!) };
};
