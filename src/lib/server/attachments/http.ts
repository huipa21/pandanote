import { DomainError, apiError, type ApiError } from '../../shared/domain.ts';

export function attachmentErrorResponse(error: unknown): Response {
  const body: ApiError =
    error instanceof DomainError
      ? error.toApiError()
      : apiError('upload-failed', 'err.attachmentRequestFailed');
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
    throw new DomainError('validation', 'err.useAJsonUploadManifest');
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
        throw new DomainError('validation', 'err.uploadManifestTimedOutRetry');
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 64 * 1024)
        throw new DomainError('validation', 'err.uploadManifestIsTooLarge');
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('validation', 'err.invalidUploadManifest');
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
