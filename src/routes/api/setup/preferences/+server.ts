import type { RequestHandler } from './$types';
import { setupPreferencesSchema } from '#lib/shared/auth.ts';
import { DomainError } from '#lib/shared/domain.ts';
import { fieldValidationResponse } from '#lib/server/auth/validation.ts';
import { authErrorResponse, readAuthJson } from '#lib/server/auth/http.ts';
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    const parsed = setupPreferencesSchema.safeParse(
      await readAuthJson(request),
    );
    if (!parsed.success) return fieldValidationResponse(parsed.error);
    locals.runtime!.auth.finishSetup(locals.identity, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
};
