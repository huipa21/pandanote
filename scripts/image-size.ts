import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { posix, resolve } from 'node:path';
import { Transform, Writable, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip, createGunzip, createZstdDecompress } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { extract, type Header, type ExtractEvents } from 'tar-stream';

type ArchiveReadable = Readable | ExtractEvents['entry'][1];

const METADATA_LIMIT = 1024 * 1024;
const ENTRY_LIMIT = 200_000;
const MIB = 1_048_576;
const size = (bytes: number) => ({ bytes, MiB: bytes / MIB });
function path(name: string): string {
  if (Buffer.byteLength(name) > 4096)
    throw new Error('Archive name metadata exceeds limit');
  const normalized = posix.normalize(name.replace(/^\.\//, ''));
  if (
    !name ||
    name.includes('\\') ||
    name.includes('\0') ||
    posix.isAbsolute(name) ||
    normalized === '..' ||
    normalized.startsWith('../')
  )
    throw new Error('Unsafe archive reference');
  return normalized;
}

// tar-stream deliberately accepts missing end markers. Verify framing/checksums
// independently, with a single 512-byte buffer; bound its hidden PAX/GNU metadata.
class TarFraming extends Transform {
  private block = Buffer.alloc(512);
  private used = 0;
  private remaining = 0;
  private zeros = 0;
  private entries = 0;
  private extensionBytes = 0;
  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: (error?: Error) => void,
  ) {
    try {
      let offset = 0;
      while (offset < chunk.length) {
        if (this.remaining) {
          const count = Math.min(this.remaining, chunk.length - offset);
          this.remaining -= count;
          offset += count;
          continue;
        }
        const count = Math.min(512 - this.used, chunk.length - offset);
        chunk.copy(this.block, this.used, offset, offset + count);
        offset += count;
        this.used += count;
        if (this.used !== 512) continue;
        this.used = 0;
        if (this.block.every((byte) => byte === 0)) {
          this.zeros++;
          continue;
        }
        if (this.zeros) throw new Error('Nonzero data after tar end marker');
        if (++this.entries > ENTRY_LIMIT)
          throw new Error('Too many tar entries');
        const octal = (start: number, end: number) => {
          const text = this.block
            .subarray(start, end)
            .toString('ascii')
            .replace(/\0.*$/, '')
            .trim();
          if (!/^[0-7]+$/.test(text))
            throw new Error('Unsupported tar numeric field');
          const value = parseInt(text, 8);
          if (!Number.isSafeInteger(value))
            throw new Error('Tar size overflow');
          return value;
        };
        const checksum = this.block.reduce(
          (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
          0,
        );
        if (checksum !== octal(148, 156))
          throw new Error('Invalid tar checksum');
        const bytes = octal(124, 136);
        if ('xgLK'.includes(String.fromCharCode(this.block[156]))) {
          this.extensionBytes += bytes;
          if (
            bytes > METADATA_LIMIT ||
            this.extensionBytes > 4 * METADATA_LIMIT
          )
            throw new Error('Tar extension metadata exceeds limit');
        }
        this.remaining = Math.ceil(bytes / 512) * 512;
      }
      this.push(chunk);
      done();
    } catch (error) {
      done(error as Error);
    }
  }
  override _flush(done: (error?: Error) => void) {
    done(
      this.used || this.remaining || this.zeros < 2
        ? new Error('Truncated tar archive')
        : undefined,
    );
  }
}
async function tar(
  input: ArchiveReadable,
  entry: (header: Header, stream: ArchiveReadable) => Promise<void>,
) {
  const parser = extract();
  parser.on('entry', (header, stream, next) => {
    // A streamx entry also emits its parent's error on destruction. The pipeline
    // rejects through the parser; consume this secondary emission as well.
    stream.on('error', () => {});
    void entry(header, stream).then(
      () => next(),
      (error: Error) => parser.destroy(error),
    );
  });
  await pipeline(input, new TarFraming(), parser);
}
async function json(stream: ArchiveReadable, bytes: number): Promise<unknown> {
  if (bytes > METADATA_LIMIT) throw new Error('Image metadata exceeds limit');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const part = Buffer.from(chunk as Uint8Array);
    total += part.length;
    if (total > METADATA_LIMIT) throw new Error('Image metadata exceeds limit');
    chunks.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    // V8 SyntaxError messages can include input fragments. Report only the
    // structural failure, never bytes/content supplied by an image archive.
    throw new Error('Invalid image metadata JSON');
  }
}
async function drain(stream: ArchiveReadable) {
  for await (const chunk of stream) void chunk;
}
interface Manifest {
  Config: string;
  RepoTags: string[] | null;
  Layers: string[];
}
interface Payload {
  files: number;
  bytes: number;
}
interface Layer {
  path: string;
  stored: ReturnType<typeof size>;
  codec: 'tar' | 'gzip' | 'zstd';
  tar: ReturnType<typeof size>;
  payload: Payload;
  nodeModules: Payload;
  dependencyMaps: Payload;
  build: Payload;
  clientPrecompressed: Payload;
  packages: Record<string, Payload>;
}
function add(payload: Payload, bytes: number) {
  payload.files++;
  payload.bytes += bytes;
}
const payload = (): Payload => ({ files: 0, bytes: 0 });
function archiveStream(archive: string): Readable {
  const source = createReadStream(archive);
  if (!archive.endsWith('.gz')) return source;
  const gunzip = createGunzip();
  source.on('error', (error) => gunzip.destroy(error));
  gunzip.on('close', () => source.destroy());
  return source.pipe(gunzip);
}

// Docker's containerd image store can export compressed layer blobs in a
// Docker-format manifest. Decode only referenced layers, never infer OCI graphs.
async function decodeLayer(stream: ArchiveReadable) {
  const iterator = stream[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) throw new Error('Empty layer payload');
  const bytes = Buffer.from(first.value as Uint8Array);
  const source = Readable.from(
    (async function* () {
      yield bytes;
      for await (const chunk of { [Symbol.asyncIterator]: () => iterator })
        yield chunk;
    })(),
  );
  const codec =
    bytes[0] === 0x1f && bytes[1] === 0x8b
      ? 'gzip'
      : bytes.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))
        ? 'zstd'
        : 'tar';
  if (codec === 'tar') return { codec, input: source } as const;
  const decoder = codec === 'gzip' ? createGunzip() : createZstdDecompress();
  source.on('error', (error) => decoder.destroy(error));
  decoder.on('close', () => source.destroy());
  return { codec, input: source.pipe(decoder) } as const;
}

export async function inspectImageArchive(archive: string, gzipLevel = 6) {
  if (!Number.isInteger(gzipLevel) || gzipLevel < 1 || gzipLevel > 9)
    throw new Error('Gzip level must be 1–9');
  const sha = createHash('sha256');
  let archiveBytes = 0;
  await pipeline(
    createReadStream(archive),
    new Writable({
      write(chunk: Buffer, _enc, done) {
        archiveBytes += chunk.length;
        sha.update(chunk);
        done();
      },
    }),
  );
  const entries = new Map<
    string,
    { type: string; bytes: number; target?: string }
  >();
  let manifest: Manifest[] | undefined;
  let nameMetadataBytes = 0;
  await tar(archiveStream(archive), async (header, stream) => {
    const name = path(header.name);
    nameMetadataBytes +=
      Buffer.byteLength(name) + Buffer.byteLength(header.linkname ?? '');
    if (nameMetadataBytes > 8 * METADATA_LIMIT)
      throw new Error('Outer name metadata exceeds limit');
    if (entries.has(name)) throw new Error('Duplicate outer archive entry');
    if (entries.size >= 50_000)
      throw new Error('Too many outer archive entries');
    entries.set(name, {
      type: header.type ?? 'file',
      bytes: header.size ?? 0,
      ...(header.linkname
        ? { target: path(posix.join(posix.dirname(name), header.linkname)) }
        : {}),
    });
    if (name === 'manifest.json')
      manifest = (await json(stream, header.size ?? 0)) as Manifest[];
    else await drain(stream);
  });
  if (!Array.isArray(manifest) || !manifest.length || manifest.length > 100)
    throw new Error(
      'Expected bounded Docker-format image manifest (OCI archives unsupported)',
    );
  const follow = (name: string): string => {
    const visited = new Set<string>();
    let current = path(name);
    while (true) {
      if (visited.has(current)) throw new Error('Cyclic layer alias');
      visited.add(current);
      const entry = entries.get(current);
      if (!entry) throw new Error('Missing image payload reference');
      if (entry.type === 'file') return current;
      if (entry.type !== 'symlink' || !entry.target)
        throw new Error('Unsupported image payload reference');
      current = entry.target;
    }
  };
  for (const image of manifest) {
    if (
      !image ||
      typeof image.Config !== 'string' ||
      !Array.isArray(image.Layers) ||
      !image.Layers.every((layer) => typeof layer === 'string') ||
      image.Layers.length > 1000 ||
      !(
        image.RepoTags === null ||
        (Array.isArray(image.RepoTags) &&
          image.RepoTags.every((tag) => typeof tag === 'string'))
      )
    )
      throw new Error('Invalid Docker image manifest');
  }
  const configPaths = new Set(manifest.map((image) => follow(image.Config)));
  const layerPaths = new Set(
    manifest.flatMap((image) => image.Layers.map(follow)),
  );
  const configs = new Map<
    string,
    {
      architecture?: string;
      os?: string;
      config?: { Labels?: Record<string, string>; Env?: string[] };
    }
  >();
  const layers = new Map<string, Layer>();
  let inspectedEntries = 0;
  let configBytes = 0;
  await tar(archiveStream(archive), async (header, stream) => {
    const name = path(header.name);
    if (configPaths.has(name)) {
      configBytes += header.size ?? 0;
      if (configBytes > 8 * METADATA_LIMIT)
        throw new Error('Combined config metadata exceeds limit');
      configs.set(name, (await json(stream, header.size ?? 0)) as never);
    } else if (layerPaths.has(name)) {
      const layer: Layer = {
        path: name,
        stored: size(header.size ?? 0),
        codec: 'tar',
        tar: size(0),
        payload: payload(),
        nodeModules: payload(),
        dependencyMaps: payload(),
        build: payload(),
        clientPrecompressed: payload(),
        packages: Object.create(null) as Record<string, Payload>,
      };
      const decoded = await decodeLayer(stream);
      layer.codec = decoded.codec;
      let decodedBytes = 0;
      const counted = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          decodedBytes += chunk.length;
          done(null, chunk);
        },
      });
      decoded.input.on('error', (error) => counted.destroy(error));
      counted.on('close', () => decoded.input.destroy());
      await tar(decoded.input.pipe(counted), async (file, body) => {
        if (++inspectedEntries > ENTRY_LIMIT)
          throw new Error('Combined layer entry metadata exceeds limit');
        if (file.type === 'file') {
          const name = path(file.name);
          const bytes = file.size ?? 0;
          add(layer.payload, bytes);
          const module = /^app\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(
            name,
          );
          if (module) {
            add(layer.nodeModules, bytes);
            add((layer.packages[module[1]] ??= payload()), bytes);
            if (name.endsWith('.map')) add(layer.dependencyMaps, bytes);
          }
          if (name.startsWith('app/build/')) add(layer.build, bytes);
          if (name.startsWith('app/build/client/') && /\.(gz|br)$/.test(name))
            add(layer.clientPrecompressed, bytes);
        }
        await drain(body);
      });
      layer.tar = size(decodedBytes);
      layers.set(name, layer);
    } else await drain(stream);
  });
  const images = manifest.map((image) => {
    const config = configs.get(follow(image.Config));
    if (
      !config ||
      typeof config.os !== 'string' ||
      typeof config.architecture !== 'string'
    )
      throw new Error('Invalid image config');
    return {
      tags: image.RepoTags,
      config: image.Config,
      platform: `${config.os}/${config.architecture}`,
      labels: config.config?.Labels ?? {},
      nodeVersion: config.config?.Env?.find((env) =>
        env.startsWith('NODE_VERSION='),
      )?.split('=')[1],
      logicalLayers: image.Layers,
      distinctLayers: [...new Set(image.Layers.map(follow))],
    };
  });
  let rawBytes = 0;
  let gzipBytes = 0;
  await pipeline(
    archiveStream(archive),
    new Transform({
      transform(chunk: Buffer, _enc, done) {
        rawBytes += chunk.length;
        done(null, chunk);
      },
    }),
    createGzip({ level: gzipLevel }),
    new Writable({
      write(chunk: Buffer, _enc, done) {
        gzipBytes += chunk.length;
        done();
      },
    }),
  );
  const packages = Object.create(null) as Record<string, Payload>;
  for (const layer of layers.values())
    for (const [name, value] of Object.entries(layer.packages)) {
      const total = (packages[name] ??= payload());
      total.bytes += value.bytes;
      total.files += value.files;
    }
  return {
    format: 'docker-archive',
    archive: size(archiveBytes),
    sha256: sha.digest('hex'),
    rawTar: size(rawBytes),
    gzip: { level: gzipLevel, ...size(gzipBytes) },
    images,
    logicalLayerReferences: manifest.reduce(
      (sum, image) => sum + image.Layers.length,
      0,
    ),
    distinctLayerPayloads: layers.size,
    layers: [...layers.values()],
    largestPackages: Object.entries(packages)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, 30)
      .map(([name, value]) => ({ name, ...value })),
    accounting:
      'Distinct stored layer blobs versus decoded layer tar and cumulative regular-file payload, not merged rootfs/allocated disk/RSS. Packages own their nested dependencies. Maps overlap package/node_modules totals; precompressed assets overlap build. Engine image size is measured separately.',
  };
}

export async function imageSizeCli(args: string[]) {
  let archive: string | undefined;
  let output: string | undefined;
  let level = 6;
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!value || seen.has(key))
      throw new Error('Missing/duplicate size option');
    seen.add(key);
    if (key === '--archive') archive = value;
    else if (key === '--output') output = value;
    else if (key === '--gzip-level') level = Number(value);
    else
      throw new Error(
        'Usage: image:inspect -- --archive <docker.tar|docker.tar.gz> [--gzip-level 6] [--output <new-report.json>]',
      );
  }
  if (!archive) throw new Error('--archive is required');
  const report =
    JSON.stringify(await inspectImageArchive(archive, level), null, 2) + '\n';
  if (output) {
    const file = await open(output, 'wx', 0o600); // Never overwrite input/existing reports.
    try {
      await file.writeFile(report);
    } finally {
      await file.close();
    }
  } else console.log(report.trimEnd());
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  imageSizeCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'Image inspection failed',
    );
    process.exitCode = 1;
  });
}
