import type { PageServerLoad } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { timelinePage } from '#lib/server/notes/timeline.ts';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
  depends('pandanote:timeline');
  const p = locals.runtime!.persistence;
  const identity = locals.identity!;
  try {
    return {
      timeline: await timelinePage(p, identity, url.searchParams),
      timelineError: '',
    };
  } catch (error) {
    return {
      timeline: null,
      timelineError:
        error instanceof DomainError
          ? error.message
          : 'Notes could not be loaded. Retry in a moment.',
    };
  }
};
