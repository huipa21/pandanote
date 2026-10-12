import type { RequestHandler } from './$types';
import { mfaRequestSchema } from '#lib/shared/auth.ts';
import { DomainError } from '#lib/shared/domain.ts';
import {
  authErrorResponse,
  readAuthJson,
  setSessionCookie,
} from '#lib/server/auth/http.ts';
import { DEVICE_COOKIE } from '#lib/server/auth/device-trust.ts';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  const deviceToken = cookies.get(DEVICE_COOKIE);
  try {
    const parsed = mfaRequestSchema.safeParse(await readAuthJson(request));
    if (!parsed.success)
      throw new DomainError(
        'unauthorized',
        'Unable to sign in. Check your credentials.',
      );
    const runtime = locals.runtime!;
    const credential = runtime.auth.completeMfa(
      parsed.data.challenge,
      parsed.data.code,
      locals.clientIp!,
      deviceToken,
    );
    setSessionCookie(cookies, credential, runtime.policy.production);
    return Response.json({ ok: true });
  } catch (error) {
    return authErrorResponse(error);
  }
};
