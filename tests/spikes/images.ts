import sharp from 'sharp';

// In-memory capability probe only; S06 adds streams, staging cleanup and a queue.
export async function processStaticProbe(
  input: Buffer,
): Promise<{ display: Buffer; thumbnail: Buffer }> {
  const metadata = await sharp(input, {
    limitInputPixels: 50_000_000,
  }).metadata();
  if ((metadata.pages ?? 1) > 1)
    throw new Error('Animated images are not supported');
  const variant = (edge: number, quality: number) =>
    sharp(input, { limitInputPixels: 50_000_000 })
      .autoOrient()
      .resize({
        width: edge,
        height: edge,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();
  return {
    display: await variant(2560, 85),
    thumbnail: await variant(480, 75),
  };
}
