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
    // Service validation keeps invalid and unknown usernames inside the same
    // verification/rate-limit boundary as incorrect passwords.
    const parsed = loginRequestSchema.safeParse(await readAuthJson(request));
    if (!parsed.success)
      throw new DomainError('unauthorized', 'Invalid username or password.');
    const runtime = locals.runtime!;
    const credential = await runtime.auth.login(
      parsed.data.username,
      parsed.data.password,
      locals.clientIp!,
    );
    if (credential.mfaRequired)
      return Response.json({
        ok: true,
        mfaRequired: true,
        challenge: credential.token,
        expiresAt: credential.expiresAt,
      });
    setSessionCookie(cookies, credential, runtime.policy.production);
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
};
