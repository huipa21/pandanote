import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import tar from 'tar-stream';

export interface Payload {
  size: number;
  sha256: string;
}
export interface Limits {
  compressed: number;
  expanded: number;
  files: number;
}

export function safeArchivePath(name: string): boolean {
  return (
    /^[a-zA-Z0-9._/-]+$/.test(name) &&
    !name.startsWith('/') &&
    name
      .split('/')
      .every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function byteLimit(max: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      callback(
        total > max ? new Error('Archive byte limit exceeded') : null,
        chunk,
      );
    },
  });
}

// tar-stream consumes extension headers before emitting entries. Reject those
// at the raw USTAR boundary, so hidden PAX/GNU overrides cannot bypass policy.
// The .pnb paths are short ASCII generated IDs and need no extension headers.
class RegularUstarOnly extends Transform {
  private header = Buffer.alloc(0);
  private remaining = 0;
  private zeros = 0;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      let offset = 0;
      while (offset < chunk.length) {
        if (this.remaining > 0) {
          const consumed = Math.min(this.remaining, chunk.length - offset);
          this.remaining -= consumed;
          offset += consumed;
          continue;
        }
        const consumed = Math.min(
          512 - this.header.length,
          chunk.length - offset,
        );
        this.header = Buffer.concat([
          this.header,
          chunk.subarray(offset, offset + consumed),
        ]);
        offset += consumed;
        if (this.header.length !== 512) continue;
        if (this.header.every((byte) => byte === 0)) {
          this.zeros++;
        } else {
          if (this.zeros > 0)
            throw new Error('Unexpected data after tar footer');
          if (![0, 48].includes(this.header[156]))
            throw new Error(
              'Only regular USTAR files allowed (no PAX, GNU, links or devices)',
            );
          if (this.header.subarray(257, 263).toString() !== 'ustar\0')
            throw new Error('USTAR format required');
          const sizeText = this.header
            .subarray(124, 136)
            .toString()
            .replaceAll('\0', '')
            .trim();
          if (!/^[0-7]+$/.test(sizeText)) throw new Error('Invalid tar size');
          const size = Number.parseInt(sizeText, 8);
          if (!Number.isSafeInteger(size)) throw new Error('Invalid tar size');
          this.remaining = Math.ceil(size / 512) * 512;
        }
        this.header = Buffer.alloc(0);
      }
      callback(null, chunk);
    } catch (error) {
      callback(error as Error);
    }
  }

  override _flush(callback: TransformCallback): void {
    callback(
      this.header.length || this.remaining || this.zeros < 2
        ? new Error('Incomplete tar archive')
        : null,
    );
  }
}

// This is a no-write validation spike, NOT the S17 restore implementation.
// Manifest/schema/auth-key validation and journaled replacement remain S16/S17.
export async function validateArchiveProbe(
  path: string,
  expected: ReadonlyMap<string, Payload>,
  limits: Limits,
): Promise<void> {
  const extract = tar.extract();
  const seen = new Set<string>();
  extract.on('entry', (header, entry, next) => {
    void (async () => {
      if (header.type !== 'file' || !safeArchivePath(header.name))
        throw new Error('Unsafe archive entry');
      if (seen.has(header.name)) throw new Error('Duplicate entry');
      if (seen.size >= limits.files) throw new Error('Too many files');
      const payload = expected.get(header.name);
      if (!payload || header.size !== payload.size)
        throw new Error('Unexpected entry or size');
      seen.add(header.name);
      const digest = createHash('sha256');
      let size = 0;
      for await (const chunk of entry) {
        size += (chunk as Buffer).length;
        if (size > payload.size) throw new Error('Entry byte limit exceeded');
        digest.update(chunk as Buffer);
      }
      if (size !== payload.size || digest.digest('hex') !== payload.sha256)
        throw new Error('Checksum or size mismatch');
      next();
    })().catch((error: Error) => next(error));
  });
  await pipeline(
    createReadStream(path),
    byteLimit(limits.compressed),
    createGunzip(),
    byteLimit(limits.expanded),
    new RegularUstarOnly(),
    extract,
  );
  if (seen.size !== expected.size) throw new Error('Missing payload');
}
