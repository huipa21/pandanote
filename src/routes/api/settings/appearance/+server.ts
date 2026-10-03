import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { readAuthJson, authErrorResponse } from '#lib/server/auth/http.ts';
import { updateAppearance } from '#lib/server/settings/repository.ts';

export const PATCH: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    const appearance = updateAppearance(
      locals.runtime!.persistence,
      await readAuthJson(request),
    );
    return Response.json({ ok: true, appearance });
  } catch (error) {
    if (error instanceof DomainError) return authErrorResponse(error);
    return Response.json(
      {
        ok: false,
        error: {
          code: 'busy',
          message: 'Appearance settings could not be saved. Please retry.',
        },
      },
      { status: 503 },
    );
  }
};
