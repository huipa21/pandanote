import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { DomainError } from '../../shared/domain.ts';
import { isRaster } from './images.ts';

export async function checksum(
  path: string,
  signal?: AbortSignal,
): Promise<{ bytes: number; digest: string }> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path, { signal })) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { bytes, digest: hash.digest('hex') };
}
export async function receive(
  body: ReadableStream<Uint8Array> | null,
  path: string,
  expectedBytes: number,
  fileLimit: number,
  imageLimit: number,
  imageHint: boolean,
  deadlineMs = 60_000,
): Promise<{ bytes: number; digest: string; head: Buffer; raster: boolean }> {
  if (!body && expectedBytes !== 0)
    throw new DomainError('validation', 'err.missingUploadBody');
  const source =
    body ??
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
  const handle = await open(path, 'wx', 0o600);
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = source.getReader();
  } catch (error) {
    await handle.close();
    throw error;
  }
  const hash = createHash('sha256');
  let bytes = 0;
  let head = Buffer.alloc(0);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, deadlineMs);
  try {
    while (true) {
      const part = await reader.read();
      if (timedOut)
        throw new DomainError('upload-failed', 'err.uploadTimedOutKeepYour');
      if (part.done) break;
      bytes += part.value.byteLength;
      if (head.length < 4096)
        head = Buffer.concat([
          head,
          Buffer.from(part.value.subarray(0, 4096 - head.length)),
        ]);
      const raster = isRaster(head);
      const cap = Math.min(
        expectedBytes,
        raster || imageHint ? imageLimit : fileLimit,
      );
      if (bytes > cap)
        throw new DomainError(
          'validation',
          'err.uploadExceedsThePermittedByte',
        );
      hash.update(part.value);
      // FileHandle.write may be partial, particularly under disk pressure.
      let offset = 0;
      while (offset < part.value.length) {
        const result = await handle.write(
          part.value,
          offset,
          part.value.length - offset,
        );
        if (result.bytesWritten === 0)
          throw new Error('Incomplete filesystem write');
        offset += result.bytesWritten;
      }
    }
    if (bytes !== expectedBytes)
      throw new DomainError('validation', 'err.uploadIsIncompleteRetryWith');
    await handle.sync();
    return { bytes, digest: hash.digest('hex'), head, raster: isRaster(head) };
  } finally {
    clearTimeout(timer);
    // Kit 3 adapter-node drains unread request bytes after sending the response.
    // Canceling here destroys IncomingMessage's socket and loses an otherwise
    // actionable validation response. Deadlines still explicitly cancel above;
    // ordinary rejection stops all disk work and releases the reader for draining.
    reader.releaseLock();
    await handle.close();
  }
}
export async function syncFile(path: string): Promise<void> {
  const handle = await open(path, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export function downloadDisposition(filename: string): string {
  // Keep the original filename in metadata, but offer only a portable basename.
  // Strip path fragments, hidden-name prefixes and OS-reserved characters.
  // Both filename parameters use the SAME sanitized name; RFC 5987 keeps Unicode.
  const base =
    (filename.split(/[\\/]/).at(-1) ?? '')
      .replace(/[:*?"<>|;]/g, '_')
      .replace(/^[.\s]+|[.\s]+$/g, '') || 'attachment';
  const fallback = base.replace(/[^\x20-\x7e]|[";]/g, '_');
  const encoded = encodeURIComponent(base).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback || 'attachment'}"; filename*=UTF-8''${encoded}`;
}
