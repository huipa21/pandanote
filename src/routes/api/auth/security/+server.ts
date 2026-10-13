import type { RequestHandler } from './$types';
import { securityRequestSchema } from '#lib/shared/auth.ts';
import { DomainError } from '#lib/shared/domain.ts';
import {
  authErrorResponse,
  readAuthJson,
  setSessionCookie,
  clearSessionCookie,
} from '#lib/server/auth/http.ts';
import { DEVICE_COOKIE } from '#lib/server/auth/device-trust.ts';
import type { SessionCredential } from '#lib/server/auth/service.ts';

export const GET: RequestHandler = ({ locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json({
      ok: true,
      ...locals.runtime!.auth.securityStatus(locals.identity),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
};
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    const identity = locals.identity;
    if (!identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    const parsed = securityRequestSchema.safeParse(await readAuthJson(request));
    if (!parsed.success)
      throw new DomainError('validation', 'err.invalidSecurityRequest');
    const input = parsed.data;
    const runtime = locals.runtime!;
    const auth = runtime.auth;
    const deviceToken = cookies.get(DEVICE_COOKIE);
    let credential: SessionCredential | undefined;
    let codes: string[] | undefined;
    switch (input.action) {
      case 'enroll':
        return Response.json({
          ok: true,
          enrollment: auth.startEnrollment(identity, input.grant),
        });
      case 'cancel-enrollment':
        auth.cancelEnrollment(identity);
        break;
      case 'confirm':
        ({ credential, codes } = auth.confirmEnrollment(
          identity,
          input.challenge,
          input.code,
          locals.clientIp!,
          deviceToken,
        ));
        break;
      case 'disable':
        credential = auth.disableMfa(identity, input.grant, deviceToken);
        break;
      case 'regenerate':
        ({ credential, codes } = auth.regenerateRecoveryCodes(
          identity,
          input.grant,
          deviceToken,
        ));
        break;
      case 'password':
        credential = await auth.changePassword(
          identity,
          input.grant,
          input.password,
          deviceToken,
        );
        break;
      case 'lifetime':
        credential = auth.changeSessionLifetime(
          identity,
          input.grant,
          input.days,
          deviceToken,
        );
        break;
      case 'revoke':
        auth.revokeAll(identity, input.grant);
        clearSessionCookie(cookies, runtime.policy.production);
        break;
    }
    if (credential)
      setSessionCookie(cookies, credential, runtime.policy.production);
    return Response.json({ ok: true, ...(codes ? { codes } : {}) });
  } catch (error) {
    return authErrorResponse(error);
  }
};
