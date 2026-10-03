import type { RequestHandler } from './$types';
import { freshAuthRequestSchema } from '#lib/shared/auth.ts';
import { DomainError } from '#lib/shared/domain.ts';
import { authErrorResponse, readAuthJson } from '#lib/server/auth/http.ts';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    const parsed = freshAuthRequestSchema.safeParse(
      await readAuthJson(request),
    );
    if (!parsed.success)
      throw new DomainError('validation', 'Invalid authentication request.');
    const { scope, password, code } = parsed.data;
    const grant = await locals.runtime!.auth.freshAuth(
      locals.identity,
      scope,
      password,
      code,
      locals.clientIp!,
    );
    return Response.json({
      ok: true,
      grant: grant.token,
      expiresAt: grant.expiresAt,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
};
