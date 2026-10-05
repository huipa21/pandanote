import { DomainError } from '../../shared/domain.ts';
export function backupErrorResponse(error: unknown): Response {
  const full = ['SQLITE_FULL', 'ENOSPC'].includes(
    (error as NodeJS.ErrnoException)?.code ?? '',
  );
  const code =
    error instanceof DomainError ? error.code : full ? 'storage-full' : 'busy';
  const message =
    error instanceof DomainError
      ? error.message
      : full
        ? 'Not enough disk space for backup. Free space and retry.'
        : 'Backup request failed. Refresh the list before retrying.';
  const status =
    code === 'unauthorized'
      ? 401
      : code === 'fresh-auth-required'
        ? 403
        : code === 'not-found'
          ? 404
          : code === 'validation'
            ? 400
            : code === 'storage-full'
              ? 507
              : 503;
  return Response.json(
    { ok: false, error: { code, message } },
    { status, headers: { 'cache-control': 'private, no-store' } },
  );
}
// Native form POST lets the browser stream a download to disk, not buffer a
// potentially multi-GB archive in JS. Grants never enter URLs, cookies or storage.
export async function readDownloadForm(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0] !==
      'application/x-www-form-urlencoded' ||
    !request.body
  )
    throw new DomainError('validation', 'Use a protected download form.');
  const reader = request.body.getReader();
  const signal = AbortSignal.timeout(15_000);
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener('abort', abort, { once: true });
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > 256)
        throw new DomainError('validation', 'Download form is too large.');
      chunks.push(part.value);
    }
    const fields = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if ([...fields.keys()].length !== 1 || !fields.has('grant'))
      throw new DomainError('validation', 'Invalid download form.');
    return { grant: fields.get('grant') };
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
