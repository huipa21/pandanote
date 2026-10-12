import type { RequestHandler } from './$types';
import { ZodError } from 'zod';
import { fieldValidationResponse } from '#lib/server/auth/validation.ts';
import {
  SETUP_CODE_MESSAGE,
  SetupCodeError,
} from '#lib/server/auth/setup-code.ts';
import {
  authErrorResponse,
  readAuthJson,
  setSessionCookie,
} from '#lib/server/auth/http.ts';

// Same 400 shape as other field errors; the code value is never echoed.
const setupCodeResponse = (): Response =>
  Response.json(
    {
      ok: false,
      error: {
        code: 'validation',
        message: 'Check the highlighted fields.',
        fields: { setupCode: SETUP_CODE_MESSAGE },
      },
    },
    { status: 400, headers: { 'cache-control': 'no-store' } },
  );

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    const runtime = locals.runtime!;
    runtime.auth.assertSetupOpen();
    const credential = await runtime.auth.createAccount(
      await readAuthJson(request),
      locals.clientIp!,
    );
    setSessionCookie(cookies, credential, runtime.policy.production);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SetupCodeError) return setupCodeResponse();
    if (error instanceof ZodError) return fieldValidationResponse(error);
    return authErrorResponse(error);
  }
};
