import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { DomainError, idSchema } from '#lib/shared/domain.ts';
import { renderMarkdown } from '#lib/shared/markdown/render.ts';
import { cardImages } from '#lib/shared/timeline.ts';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
  depends('pandanote:detail');
  if (!idSchema.safeParse(params.noteId).success) error(404, 'Note not found.');
  try {
    const detail = locals.runtime!.notes.get(locals.identity!, params.noteId);
    return {
      detail,
      rendered: await renderMarkdown(detail.bodyMarkdown, cardImages(detail)),
    };
  } catch (failure) {
    if (failure instanceof DomainError && failure.code === 'not-found')
      error(404, 'Note not found.');
    error(503, 'This note could not be loaded. Retry in a moment.');
  }
};
