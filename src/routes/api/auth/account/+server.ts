import type { RequestHandler } from './$types';
import { accountUpdateSchema } from '#lib/shared/auth.ts';
import { DomainError } from '#lib/shared/domain.ts';
import { fieldValidationResponse } from '#lib/server/auth/validation.ts';
import { authErrorResponse, readAuthJson } from '#lib/server/auth/http.ts';
export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    const parsed = accountUpdateSchema.safeParse(await readAuthJson(request));
    if (!parsed.success) return fieldValidationResponse(parsed.error);
    const { grant, ...details } = parsed.data;
    const account = locals.runtime!.auth.updateAccount(
      locals.identity,
      grant,
      details,
    );
    return Response.json({ ok: true, account });
  } catch (error) {
    return authErrorResponse(error);
  }
};
