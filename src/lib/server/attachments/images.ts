import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import type { AppSettings } from '../../shared/settings.ts';
import { DomainError } from '../../shared/domain.ts';
import { imageQueue, type ImageQueue } from './resources.ts';

// Embedded application-owned worker source ships inside the server bundle.
// A subprocess provides a real wall-clock kill deadline (including metadata),
// unlike Promise.race or a cooperative libvips timeout. No user source is executed.
const workerSource = String.raw`
const fs = require('node:fs');
const sharp = require(process.argv[1]);
sharp.cache(false);
sharp.concurrency(1);
process.umask(0o077);
(async () => {
  const startedAt = Date.now();
  const { input, display, thumbnail, settings: s } = JSON.parse(fs.readFileSync(0, 'utf8'));
  // libvips can expose APNG as a single static PNG. Inspect the container's
  // bounded chunk headers without decoding/buffering its payloads first.
  const fd = fs.openSync(input, 'r');
  try {
    const head = Buffer.alloc(32); fs.readSync(fd, head, 0, 32, 0);
    const size = fs.fstatSync(fd).size;
    const png = head.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
    if (png || webp) {
      const header = Buffer.alloc(8);
      let offset = png ? 8 : 12;
      while (offset + 8 <= size) {
        fs.readSync(fd, header, 0, 8, offset);
        const type = header.toString('ascii', png ? 4 : 0, png ? 8 : 4);
        if ((png && type === 'acTL') || (webp && ['ANIM', 'ANMF'].includes(type))) throw Error('animation');
        const length = png ? header.readUInt32BE(0) : header.readUInt32LE(4);
        offset += png ? length + 12 : length + 8 + (length % 2);
        if (offset > size) throw Error('invalid');
      }
    }
    if (head.toString('ascii', 4, 8) === 'ftyp' && /avis|msf1|hevc|hevx/.test(head.toString('ascii', 8, 32))) throw Error('animation');
  } finally { fs.closeSync(fd); }
  const options = { limitInputPixels: s.imageMaxPixels, failOn: 'warning', sequentialRead: true };
  const metadata = await sharp(input, options).metadata();
  if (!['jpeg', 'png', 'webp', 'gif', 'tiff', 'heif'].includes(metadata.format)) throw Error('format');
  if ((metadata.pages || 1) !== 1 || (metadata.delay && metadata.delay.length > 1)) throw Error('animation');
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > s.imageMaxPixels) throw Error('pixels');
  const displayInfo = await sharp(input, options).autoOrient()
    .resize({ width: s.displayMaxEdge, height: s.displayMaxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: s.displayQuality }).timeout({ seconds: 25 }).toFile(display);
  const thumbnailInfo = await sharp(input, options).autoOrient()
    .resize({ width: s.thumbnailMaxEdge, height: s.thumbnailMaxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: s.thumbnailQuality }).timeout({ seconds: 25 }).toFile(thumbnail);
  process.stdout.write(JSON.stringify({ mime: metadata.format === 'heif' ? (metadata.compression === 'hevc' ? 'image/heic' : 'image/avif') : 'image/' + metadata.format,
    width: displayInfo.width, height: displayInfo.height,
    thumbnailWidth: thumbnailInfo.width, thumbnailHeight: thumbnailInfo.height,
    peakRssKiB: process.resourceUsage().maxRSS, elapsedMs: Date.now() - startedAt }));
})().catch((e) => {
  const message = String(e.message);
  process.stdout.write(JSON.stringify({ error: message === 'animation' ? 'animation' : /pixel/i.test(message) ? 'pixels' : 'invalid' }));
  process.exitCode = 1;
});
`;
export interface ImageResult {
  mime: string;
  width: number;
  height: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  peakRssKiB: number;
  elapsedMs: number;
}
export async function processImage(
  input: string,
  display: string,
  thumbnail: string,
  settings: AppSettings,
  queue: ImageQueue = imageQueue,
  deadlineMs = 30_000,
): Promise<ImageResult> {
  return queue.run(
    () =>
      new Promise<ImageResult>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            '--max-old-space-size=128',
            '--input-type=commonjs',
            '-e',
            workerSource,
            createRequire(import.meta.url).resolve('sharp'),
          ],
          { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
        );
        let output = '';
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, deadlineMs);
        child.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
          if (output.length > 4096) child.kill('SIGKILL');
        });
        // Never log native errors (which contain paths); bound and discard them.
        child.stderr.resume();
        child.stdin.on('error', () => {
          /* Early child exit is handled on close. */
        });
        child.on('error', () => {
          clearTimeout(timer);
          reject(
            new DomainError('upload-failed', 'err.imageProcessorCouldNotStart'),
          );
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (timedOut) {
            reject(
              new DomainError(
                'upload-failed',
                'err.imageProcessingTimedOutTry',
              ),
            );
            return;
          }
          try {
            const result = JSON.parse(output) as ImageResult & {
              error?: string;
            };
            if (code !== 0 || result.error) {
              reject(
                new DomainError(
                  'validation',
                  result.error === 'animation'
                    ? 'err.animatedImagesAreNotSupported'
                    : result.error === 'pixels'
                      ? 'err.imageExceedsTheDecodedPixel'
                      : 'err.imageIsCorruptOrUses',
                ),
              );
            } else if (
              typeof result.mime === 'string' &&
              [
                result.width,
                result.height,
                result.thumbnailWidth,
                result.thumbnailHeight,
              ].every((v) => Number.isSafeInteger(v) && v > 0)
            )
              resolve(result);
            else throw new Error('Invalid worker result');
          } catch {
            reject(
              new DomainError(
                'upload-failed',
                'err.imageProcessingFailedRetryWith',
              ),
            );
          }
        });
        child.stdin.end(
          JSON.stringify({ input, display, thumbnail, settings }),
        );
      }),
  );
}

/** Magic, not filename/MIME, selects raster processing even through file pickers. */
export function isRaster(head: Buffer): boolean {
  return (
    (head[0] === 0xff && head[1] === 0xd8) ||
    head
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    /^GIF8[79]a/.test(head.toString('ascii', 0, 6)) ||
    (head.toString('ascii', 0, 4) === 'RIFF' &&
      head.toString('ascii', 8, 12) === 'WEBP') ||
    head.subarray(0, 4).equals(Buffer.from([73, 73, 42, 0])) ||
    head.subarray(0, 4).equals(Buffer.from([77, 77, 0, 42])) ||
    head.subarray(0, 4).equals(Buffer.from([73, 73, 43, 0])) ||
    head.subarray(0, 4).equals(Buffer.from([77, 77, 0, 43])) ||
    head.toString('ascii', 0, 2) === 'BM' ||
    (head.toString('ascii', 4, 8) === 'ftyp' &&
      /avif|avis|heic|heix|hevc|hevx|mif1|msf1/.test(
        head.toString('ascii', 8, 32),
      ))
  );
}
export function fileMime(head: Buffer): string {
  if (head.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4)
    return 'application/zip';
  const text = head.toString('utf8').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)) return 'image/svg+xml';
  if (/^(?:<!doctype html|<html)[\s>]/i.test(text)) return 'text/html';
  return 'application/octet-stream';
}

/** Audio containers by magic bytes only. webm/mp4/ogg may also hold video, so the
 * caller applies this solely to items explicitly flagged `voice`; the client MIME
 * is never consulted. Returns null when the bytes are not a supported container. */
export function voiceMime(head: Buffer): string | null {
  if (head.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
    // EBML header: require the WebM doctype (not generic Matroska).
    return head.subarray(4, 64).includes(Buffer.from('webm', 'ascii'))
      ? 'audio/webm'
      : null;
  if (head.toString('latin1', 4, 8) === 'ftyp') {
    const brand = head.toString('latin1', 8, 12);
    return brand === 'M4A ' || brand === 'mp42' || /^iso[0-9a-z]$/.test(brand)
      ? 'audio/mp4'
      : null;
  }
  if (head.toString('latin1', 0, 4) === 'OggS') return 'audio/ogg';
  return null;
}
