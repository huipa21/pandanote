import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { DomainError, idSchema } from '#lib/shared/domain.ts';
import { renderMarkdown } from '#lib/shared/markdown/render.ts';
import { cardImages } from '#lib/shared/timeline.ts';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
  depends('pandanote:detail');
  if (!idSchema.safeParse(params.noteId).success)
    error(404, {
      message: 'Note not found.',
      messageKey: 'err.noteNotFoundShort',
    });
  try {
    const detail = locals.runtime!.notes.get(locals.identity!, params.noteId);
    return {
      detail,
      rendered: await renderMarkdown(
        detail.bodyMarkdown,
        cardImages(detail),
        locals.i18n?.language,
      ),
    };
  } catch (failure) {
    if (failure instanceof DomainError && failure.code === 'not-found')
      error(404, {
        message: 'Note not found.',
        messageKey: 'err.noteNotFoundShort',
      });
    error(503, {
      message: 'This note could not be loaded. Retry in a moment.',
      messageKey: 'err.noteLoadFailed',
    });
  }
};
