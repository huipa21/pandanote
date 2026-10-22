import { z } from 'zod';
import type { RequestHandler } from './$types';
import { loginPasswordSchema } from '#lib/shared/auth.ts';
import { DomainError } from '#lib/shared/domain.ts';
import { vaultState } from '#lib/server/auth/vault.ts';
import { authErrorResponse, readAuthJson } from '#lib/server/auth/http.ts';

const commandSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('unlock'),
    password: loginPasswordSchema,
  }),
  z.strictObject({ action: z.literal('close') }),
]);

export const GET: RequestHandler = ({ locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    return Response.json(
      {
        ok: true,
        data: vaultState(locals.runtime!.persistence.db, locals.identity),
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    const parsed = commandSchema.safeParse(await readAuthJson(request));
    if (!parsed.success)
      throw new DomainError('validation', 'err.invalidAuthenticationRequest');
    const data =
      parsed.data.action === 'unlock'
        ? await locals.runtime!.auth.unlockVault(
            locals.identity,
            parsed.data.password,
            locals.clientIp!,
          )
        : locals.runtime!.auth.closeVault(locals.identity);
    return Response.json(
      { ok: true, data },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
};
