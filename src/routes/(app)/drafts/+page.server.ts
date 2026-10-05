import type { PageServerLoad } from './$types';
import { statusPage } from '#lib/server/notes/status-list.ts';
export const load: PageServerLoad = ({ locals, depends }) => {
  depends('pandanote:status-notes');
  try {
    return {
      statusList: statusPage(
        locals.runtime!.persistence,
        locals.identity!,
        new URLSearchParams({ status: 'draft' }),
      ),
      statusError: '',
    };
  } catch {
    return {
      statusList: null,
      statusError:
        'Server drafts could not be loaded. Your browser drafts are kept. Retry in a moment.',
    };
  }
};
