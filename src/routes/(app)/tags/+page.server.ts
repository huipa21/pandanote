import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, depends, url }) => {
  depends('pandanote:tags');
  const q = (url.searchParams.get('q') ?? '').slice(0, 256);
  return {
    q,
    tagPage: locals.runtime!.tags.page(locals.identity!, q, 0, 60),
  };
};
