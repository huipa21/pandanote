import { randomFillSync, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { performance } from 'node:perf_hooks';
import { processImage } from '../src/lib/server/attachments/images.ts';
import { DEFAULT_SETTINGS } from '../src/lib/shared/settings.ts';

// Synthetic only. Never reads app data or emits filenames/coordinate/content.
sharp.cache(false);
sharp.concurrency(1);
const root = await mkdtemp(join(tmpdir(), 'pandanote-image-measure-'));
let peakParentRssMiB = process.memoryUsage().rss / 1024 ** 2;
const baselineParentRssMiB = peakParentRssMiB;
const sampler = setInterval(() => {
  peakParentRssMiB = Math.max(
    peakParentRssMiB,
    process.memoryUsage().rss / 1024 ** 2,
  );
}, 10);
try {
  const noise = Buffer.alloc(6000 * 3333 * 3);
  randomFillSync(noise);
  const inputs = [
    await sharp({
      create: { width: 10000, height: 5000, channels: 3, background: 'green' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 85 })
      .toBuffer(),
    await sharp(noise, { raw: { width: 6000, height: 3333, channels: 3 } })
      .jpeg({ quality: 70 })
      .toBuffer(),
  ];
  const jobs = [inputs[0], inputs[1], inputs[0]];
  if (jobs.some((input) => input.length > DEFAULT_SETTINGS.imageInputMaxBytes))
    throw new Error('Synthetic input exceeded the configured byte limit');
  const paths = await Promise.all(
    jobs.map(async (input) => {
      const path = join(root, `${randomUUID()}.tmp`);
      await writeFile(path, input);
      return path;
    }),
  );
  const started = performance.now();
  const results = await Promise.all(
    paths.map((input, i) =>
      processImage(
        input,
        join(root, `display-${i}.webp`),
        join(root, `thumbnail-${i}.webp`),
        { ...DEFAULT_SETTINGS },
      ),
    ),
  );
  const peakChildRssMiB = Math.max(
    ...results.map((result) => result.peakRssKiB / 1024),
  );
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        sharp: sharp.versions.sharp,
        libvips: sharp.versions.vips,
        maxConcurrent: 1,
        maxQueued: 2,
        hardJobDeadlineMs: 30_000,
        fixtures: [
          { pixels: 50_000_000, orientation: 6 },
          { pixels: 19_998_000, noise: true },
          { pixels: 50_000_000, orientation: 6 },
        ],
        inputMiB: jobs.map(
          (input) => Math.round((input.length / 1024 ** 2) * 100) / 100,
        ),
        nativeJobMs: results.map((result) => result.elapsedMs),
        batchWallMs: Math.round(performance.now() - started),
        baselineParentRssMiB: Math.round(baselineParentRssMiB),
        peakParentRssMiB: Math.round(peakParentRssMiB),
        peakChildRssMiB: Math.round(peakChildRssMiB),
        conservativeCombinedPeakMiB: Math.round(
          peakParentRssMiB + peakChildRssMiB,
        ),
        outputDimensions: results.map(({ width, height }) => [width, height]),
      },
      null,
      2,
    ),
  );
} finally {
  clearInterval(sampler);
  await rm(root, { recursive: true, force: true });
}
