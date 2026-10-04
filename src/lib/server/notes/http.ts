import { DomainError, type ApiError } from '../../shared/domain.ts';
import { NoteConflictError } from './service.ts';

// JSON escaping can expand a valid 1 MiB Markdown string six-fold. Keep an
// independent transport cap; semantic UTF-8 and configured limits still apply.
export const MAX_NOTE_JSON_BYTES = 6 * 1_048_576 + 64 * 1024;
export async function readNoteJson(request: Request): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0].trim() !==
      'application/json' ||
    !request.body
  )
    throw new DomainError(
      'validation',
      'Use an application/json note request.',
    );
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_NOTE_JSON_BYTES))
    throw new DomainError('validation', 'Note request is too large.');
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
          'Note request timed out. Keep your local work and retry.',
        );
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_NOTE_JSON_BYTES)
        throw new DomainError('validation', 'Note request is too large.');
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError('validation', 'Invalid JSON note request.');
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function noteErrorResponse(
  error: unknown,
  fallback = 'Note could not be saved. Keep your local work and retry.',
): Response {
  const body: ApiError =
    error instanceof DomainError
      ? {
          code: error.code,
          message: error.message,
          ...(error instanceof NoteConflictError
            ? { conflict: error.snapshot }
            : {}),
        }
      : {
          code: 'busy',
          message: fallback,
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
            : 503;
  return Response.json(
    { ok: false, error: body },
    {
      status,
      headers: {
        'cache-control': 'private, no-store',
        ...(status === 503 ? { 'retry-after': '2' } : {}),
      },
    },
  );
}
