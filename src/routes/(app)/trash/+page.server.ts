import type { PageServerLoad } from './$types';
import { statusPage } from '#lib/server/notes/status-list.ts';
import { DomainError } from '#lib/shared/domain.ts';
import { STATUS_PAGE_SIZE } from '#lib/shared/status-notes.ts';

export const load: PageServerLoad = ({ locals, depends, url }) => {
  depends('pandanote:status-notes');
  const q = (url.searchParams.get('q') ?? '').slice(0, 1024);
  try {
    return {
      q,
      statusList: statusPage(
        locals.runtime!.persistence,
        locals.identity!,
        new URLSearchParams({
          status: 'trash',
          limit: String(STATUS_PAGE_SIZE),
          q,
        }),
      ),
      statusError: '',
    };
  } catch (error) {
    return {
      q,
      statusList: null,
      statusError:
        error instanceof DomainError && error.code === 'validation'
          ? error.message
          : 'Trash could not be loaded. No notes were removed. Retry in a moment.',
    };
  }
};
