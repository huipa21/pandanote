import type { PageServerLoad } from './$types';
import { statusPage } from '#lib/server/notes/status-list.ts';
export const load: PageServerLoad = ({ locals, depends }) => {
  depends('pandanote:status-notes');
  try {
    return {
      statusList: statusPage(
        locals.runtime!.persistence,
        locals.identity!,
        new URLSearchParams({ status: 'trash' }),
      ),
      statusError: '',
    };
  } catch {
    return {
      statusList: null,
      statusError:
        'Trash could not be loaded. No notes were removed. Retry in a moment.',
    };
  }
};
