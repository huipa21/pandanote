import type { RequestHandler } from './$types';
import { setupRequestSchema } from '#lib/shared/auth.ts';
import { DomainError } from '#lib/shared/domain.ts';
import {
  authErrorResponse,
  readAuthJson,
  setSessionCookie,
} from '#lib/server/auth/http.ts';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    const parsed = setupRequestSchema.safeParse(await readAuthJson(request));
    if (!parsed.success)
      throw new DomainError(
        'validation',
        'Provide the operator token and a password of 12–256 characters.',
      );
    const runtime = locals.runtime!;
    const credential = await runtime.auth.setup(
      parsed.data.token,
      parsed.data.password,
      locals.clientIp!,
    );
    setSessionCookie(cookies, credential, runtime.policy.production);
    return Response.json({ ok: true }); // No bearer tokens/hashes in DTOs.
  } catch (error) {
    return authErrorResponse(error);
  }
};
