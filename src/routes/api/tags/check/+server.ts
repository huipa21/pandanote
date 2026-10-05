import { z } from 'zod';
import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { tagKeySchema, tagAcknowledgementsSchema } from '#lib/shared/tags.ts';
import { noteErrorResponse, readNoteJson } from '#lib/server/notes/http.ts';
const schema = z.strictObject({
  keys: z.array(tagKeySchema).max(100),
  acknowledged: tagAcknowledgementsSchema.optional(),
});
export const POST: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    const parsed = schema.safeParse(await readNoteJson(request, 64 * 1024));
    if (!parsed.success)
      throw new DomainError('validation', 'Invalid tag history check.');
    return Response.json({
      ok: true,
      data: locals.runtime!.tags.check(
        locals.identity,
        parsed.data.keys,
        parsed.data.acknowledged,
      ),
    });
  } catch (error) {
    return noteErrorResponse(
      error,
      'Tag history could not be checked. Local draft retained; retry.',
    );
  }
};
