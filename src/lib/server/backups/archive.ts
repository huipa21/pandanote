import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip } from 'node:zlib';
import tar from 'tar-stream';
import {
  backupManifestSchema,
  PRE_RELEASE_BACKUP_MESSAGE,
  BACKUP_MANIFEST_BYTES,
  BACKUP_MAX_BYTES,
  BACKUP_MAX_ENTRIES,
  type BackupManifest,
} from '../../shared/backups.ts';
import { DomainError, idSchema } from '../../shared/domain.ts';

// tar-stream consumes extension records before entry callbacks. Reject them at
// the raw boundary, including hidden PAX/GNU name/size overrides. No extraction.
export class RegularUstarOnly extends Transform {
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
        if (this.remaining) {
          const used = Math.min(this.remaining, chunk.length - offset);
          this.remaining -= used;
          offset += used;
          continue;
        }
        const used = Math.min(512 - this.header.length, chunk.length - offset);
        this.header = Buffer.concat([
          this.header,
          chunk.subarray(offset, offset + used),
        ]);
        offset += used;
        if (this.header.length !== 512) continue;
        if (this.header.every((byte) => byte === 0)) this.zeros++;
        else {
          if (
            this.zeros ||
            ![0, 48].includes(this.header[156]) ||
            this.header.subarray(257, 263).toString() !== 'ustar\0'
          )
            throw new Error('Only regular USTAR payloads are supported');
          const text = this.header
            .subarray(124, 136)
            .toString()
            .replaceAll('\0', '')
            .trim();
          if (!/^[0-7]+$/.test(text)) throw new Error('Invalid tar size');
          const size = Number.parseInt(text, 8);
          if (!Number.isSafeInteger(size) || size > BACKUP_MAX_BYTES)
            throw new Error('Invalid tar size');
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
function byteLimit(max: number): Transform {
  let total = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      callback(total > max ? new Error('Archive limit exceeded') : null, chunk);
    },
  });
}
function parseManifest(bytes: Buffer): BackupManifest {
  const input: unknown = JSON.parse(bytes.toString('utf8'));
  if (
    input !== null &&
    typeof input === 'object' &&
    'format' in input &&
    input.format === 'PandaNote' &&
    'formatVersion' in input &&
    input.formatVersion === 1
  )
    throw new DomainError('invalid-backup', PRE_RELEASE_BACKUP_MESSAGE);
  const manifest = backupManifestSchema.parse(input);
  for (const entry of manifest.entries) {
    if (entry.path.startsWith('files/'))
      idSchema.parse(entry.path.split('/')[1]);
  }
  return manifest;
}
export async function writeArchive(
  path: string,
  manifest: BackupManifest,
  source: (name: string) => string,
  signal: AbortSignal,
): Promise<void> {
  const pack = tar.pack();
  const done = pipeline(
    pack,
    createGzip({ level: 6 }),
    byteLimit(BACKUP_MAX_BYTES),
    createWriteStream(path, { flags: 'wx', mode: 0o600 }),
    { signal },
  );
  // Attach a handler immediately; input failures must not leave an unhandled
  // compressor/output rejection while the producer is still awaiting an entry.
  void done.catch(() => {});
  const header = (name: string, size: number): tar.Header => ({
    linkname: '',
    uname: '',
    gname: '',
    devmajor: 0,
    devminor: 0,
    name,
    size,
    type: 'file',
    mode: 0o600,
    uid: 0,
    gid: 0,
    mtime: new Date(manifest.createdAt),
  });
  try {
    const bytes = Buffer.from(JSON.stringify(manifest));
    if (bytes.length > BACKUP_MANIFEST_BYTES)
      throw new Error('Manifest limit exceeded');
    await new Promise<void>((resolve, reject) =>
      pack.entry(header('manifest.json', bytes.length), bytes, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    for (const entry of manifest.entries) {
      signal.throwIfAborted();
      await pipeline(
        createReadStream(source(entry.path)),
        pack.entry(header(entry.path, entry.size)),
        { signal },
      );
    }
    pack.finalize();
    await done;
  } catch (error) {
    pack.destroy(error as Error);
    await done.catch(() => {});
    throw error;
  }
}
/** Bounded no-write format/path/type/duplicate/checksum validation. This is not
 * S17 database trust validation or a restore/extraction implementation. */
export async function verifyArchive(
  path: string,
  signal: AbortSignal,
  expected?: BackupManifest,
  destination?: string,
  onManifest?: (manifest: BackupManifest) => void,
): Promise<BackupManifest> {
  const extract = tar.extract();
  let manifest: BackupManifest | undefined;
  const seen = new Set<string>();
  let inventory = new Map<string, { size: number; sha256: string }>();
  extract.on('entry', (header, entry, next) => {
    void (async () => {
      if (
        header.type !== 'file' ||
        seen.has(header.name) ||
        seen.size >= BACKUP_MAX_ENTRIES
      )
        throw new Error('Unsafe or duplicate archive entry');
      if (!manifest) {
        if (
          header.name !== 'manifest.json' ||
          header.size! > BACKUP_MANIFEST_BYTES
        )
          throw new Error('Manifest must be first and bounded');
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of entry) {
          bytes += (chunk as Buffer).length;
          if (bytes > BACKUP_MANIFEST_BYTES)
            throw new Error('Manifest limit exceeded');
          chunks.push(chunk as Buffer);
        }
        manifest = parseManifest(Buffer.concat(chunks));
        if (expected && JSON.stringify(manifest) !== JSON.stringify(expected))
          throw new Error('Manifest mismatch');
        onManifest?.(manifest);
        inventory = new Map(manifest.entries.map((item) => [item.path, item]));
      } else {
        const item = inventory.get(header.name);
        if (!item || item.size !== header.size)
          throw new Error('Unexpected entry or size');
        const hash = createHash('sha256');
        let bytes = 0;
        if (destination) {
          // Only exact allowlisted manifest paths reach this branch. The caller
          // supplies a newly created private tree, never an uploaded directory.
          const output = join(destination, ...header.name.split('/'));
          mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
          const checked = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              bytes += chunk.length;
              hash.update(chunk);
              callback(
                bytes > item.size ? new Error('Entry limit exceeded') : null,
                chunk,
              );
            },
          });
          await pipeline(
            entry,
            checked,
            createWriteStream(output, { flags: 'wx', mode: 0o600 }),
            { signal },
          );
        } else {
          for await (const chunk of entry) {
            bytes += (chunk as Buffer).length;
            if (bytes > item.size) throw new Error('Entry limit exceeded');
            hash.update(chunk as Buffer);
          }
        }
        if (bytes !== item.size || hash.digest('hex') !== item.sha256)
          throw new Error('Checksum mismatch');
      }
      seen.add(header.name);
      next();
    })().catch((error: Error) => next(error));
  });
  await pipeline(
    createReadStream(path),
    byteLimit(BACKUP_MAX_BYTES),
    createGunzip(),
    byteLimit(
      BACKUP_MAX_BYTES + BACKUP_MAX_ENTRIES * 1024 + BACKUP_MANIFEST_BYTES,
    ),
    new RegularUstarOnly(),
    extract,
    { signal },
  );
  if (!manifest || seen.size !== manifest.entries.length + 1)
    throw new Error('Missing archive payload');
  return manifest;
}
