import { DomainError } from '#lib/shared/domain.ts';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, depends, url }) => {
  depends('pandanote:tags');
  const q = (url.searchParams.get('q') ?? '').slice(0, 256);
  try {
    return {
      q,
      searchError: null,
      tagPage: locals.runtime!.tags.page(locals.identity!, q, 0, 60),
    };
  } catch (error) {
    // A malformed search expression is shown beside the field, not as an error page.
    if (error instanceof DomainError && error.code === 'validation')
      return {
        q,
        searchError: error.toApiError(),
        tagPage: { items: [], nextOffset: null },
      };
    throw error;
  }
};
