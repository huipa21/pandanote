import type { RequestHandler } from './$types';
import { loginRequestSchema } from '#lib/shared/auth.ts';
import { DomainError } from '#lib/shared/domain.ts';
import {
  authErrorResponse,
  readAuthJson,
  setSessionCookie,
} from '#lib/server/auth/http.ts';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    const parsed = loginRequestSchema.safeParse(await readAuthJson(request));
    if (!parsed.success)
      throw new DomainError(
        'unauthorized',
        'Unable to sign in. Check your credentials.',
      );
    const runtime = locals.runtime!;
    const credential = await runtime.auth.login(
      parsed.data.password,
      locals.clientIp!,
    );
    setSessionCookie(cookies, credential, runtime.policy.production);
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
};
