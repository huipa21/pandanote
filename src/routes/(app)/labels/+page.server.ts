import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, depends }) => {
  depends('pandanote:labels');
  return { labels: locals.runtime!.labels.list(locals.identity!) };
};
