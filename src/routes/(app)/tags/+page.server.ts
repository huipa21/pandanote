import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, depends, url }) => {
  depends('pandanote:tags');
  return {
    managedTags: locals.runtime!.tags.list(
      locals.identity!,
      url.searchParams.get('q') ?? '',
    ),
  };
};
