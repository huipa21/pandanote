import { DomainError, type ApiError } from '../../shared/domain.ts';

export function attachmentErrorResponse(error: unknown): Response {
  const body: ApiError =
    error instanceof DomainError
      ? { code: error.code, message: error.message }
      : {
          code: 'upload-failed',
          message:
            'Attachment request failed. Keep your local files and retry.',
        };
  const status =
    body.code === 'unauthorized'
      ? 401
      : body.code === 'not-found'
        ? 404
        : ['conflict', 'mutation-mismatch'].includes(body.code)
          ? 409
          : body.code === 'validation'
            ? 400
            : body.code === 'storage-full'
              ? 507
              : 503;
  return Response.json(
    { ok: false, error: body },
    {
      status,
      headers: {
        'cache-control': 'no-store',
        ...(status === 503 ? { 'retry-after': '2' } : {}),
      },
    },
  );
}
export async function readBatchJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
      'application/json' ||
    !request.body
  )
    throw new DomainError('validation', 'Use a JSON upload manifest.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 15_000);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut)
        throw new DomainError(
          'validation',
          'Upload manifest timed out. Retry the posting attempt.',
        );
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 64 * 1024)
        throw new DomainError('validation', 'Upload manifest is too large.');
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('validation', 'Invalid upload manifest.');
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
