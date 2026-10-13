import type { RequestHandler } from './$types';
import { DomainError } from '#lib/shared/domain.ts';
import {
  backupErrorResponse,
  readDownloadForm,
} from '#lib/server/backups/http.ts';
export const POST: RequestHandler = async ({
  locals,
  request,
  params,
  url,
}) => {
  try {
    if (!locals.identity)
      throw new DomainError('unauthorized', 'err.signInToContinue');
    if (url.search)
      throw new DomainError('validation', 'err.downloadGrantsMustNotBe');
    return await locals.runtime!.backups.download(
      locals.identity,
      params.backupId,
      await readDownloadForm(request),
    );
  } catch (error) {
    return backupErrorResponse(error);
  }
};
