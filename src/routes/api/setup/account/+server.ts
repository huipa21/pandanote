import type { RequestHandler } from './$types';
import { ZodError } from 'zod';
import { fieldValidationResponse } from '#lib/server/auth/validation.ts';
import {
  authErrorResponse,
  readAuthJson,
  setSessionCookie,
} from '#lib/server/auth/http.ts';
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
    if (error instanceof ZodError) return fieldValidationResponse(error);
    return authErrorResponse(error);
  }
};
