import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import { readNoteJson, noteErrorResponse } from '#lib/server/notes/http.ts';
import {
  readSettings,
  updateStorageLimits,
} from '#lib/server/settings/repository.ts';
import { storageUsage } from '#lib/server/settings/storage.ts';
import { storageLimitsFrom } from '#lib/shared/storage.ts';
export const GET: RequestHandler = ({ locals }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    return Response.json({
      ok: true,
      data: {
        limits: storageLimitsFrom(readSettings(locals.runtime!.persistence)),
        usage: storageUsage(locals.runtime!.persistence, locals.identity),
      },
    });
  } catch (error) {
    return noteErrorResponse(
      error,
      'Storage could not be measured. Retry refreshing storage.',
    );
  }
};
export const PATCH: RequestHandler = async ({ locals, request }) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'Sign in to continue.');
    return Response.json({
      ok: true,
      data: updateStorageLimits(
        locals.runtime!.persistence,
        locals.identity,
        await readNoteJson(request, 4096),
      ),
    });
  } catch (error) {
    return noteErrorResponse(
      error,
      'Storage limits could not be saved. Your choices remain; retry.',
    );
  }
};
