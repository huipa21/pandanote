import type { PageServerLoad } from './$types';
import { DomainError, apiError } from '#lib/shared/domain.ts';
import { timelinePage } from '#lib/server/notes/timeline.ts';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
  depends('pandanote:timeline');
  const p = locals.runtime!.persistence;
  const identity = locals.identity!;
  try {
    const timeline = await timelinePage(p, identity, url.searchParams);
    // A single-tag filter is a tag view with its own summary and management menu.
    const key = timeline.filters.tag ?? null;
    return {
      timeline,
      timelineError: null,
      tagSummary: key ? locals.runtime!.tags.summary(identity, key) : null,
    };
  } catch (error) {
    return {
      timeline: null,
      tagSummary: null,
      timelineError:
        error instanceof DomainError
          ? error.toApiError()
          : apiError('busy', 'err.notesLoadFailed'),
    };
  }
};
