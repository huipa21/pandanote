import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processStaticProbe } from '../spikes/images';

describe('real Sharp/libvips capabilities', () => {
  it('corrects orientation, strips EXIF (including GPS), creates WebP without upscale', async () => {
    const input = await sharp({
      create: { width: 80, height: 40, channels: 3, background: 'red' },
    })
      .withMetadata({ orientation: 6 })
      .withExifMerge({
        IFD0: { Artist: 'Synthetic fixture' },
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '1/1 2/1 3/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '4/1 5/1 6/1',
        },
      })
      .jpeg()
      .toBuffer();
    const original = await sharp(input).metadata();
    expect(original.orientation).toBe(6);
    expect(original.exif).toBeDefined();
    expect(original.exif?.includes(Buffer.from('Synthetic fixture'))).toBe(
      true,
    );
    const result = await processStaticProbe(input);
    for (const output of [result.display, result.thumbnail]) {
      const metadata = await sharp(output).metadata();
      expect(metadata.format).toBe('webp');
      expect([metadata.width, metadata.height]).toEqual([40, 80]);
      expect(metadata.orientation).toBeUndefined();
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
    }
    console.info(
      `Sharp ${sharp.versions.sharp}; libvips ${sharp.versions.vips}; WebP/orientation/metadata OK`,
    );
  });

  it('bounds dimensions and retains alpha for static PNG/GIF', async () => {
    const input = await sharp({
      create: {
        width: 2800,
        height: 1400,
        channels: 4,
        background: { r: 0, g: 128, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer();
    const result = await processStaticProbe(input);
    expect(await sharp(result.display).metadata()).toMatchObject({
      width: 2560,
      height: 1280,
      hasAlpha: true,
    });
    expect(await sharp(result.thumbnail).metadata()).toMatchObject({
      width: 480,
      height: 240,
    });
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 4, background: 'green' },
    })
      .gif()
      .toBuffer();
    expect(
      await sharp((await processStaticProbe(gif)).display).metadata(),
    ).toMatchObject({ format: 'webp', width: 4, height: 4 });
  });

  it.each(['gif', 'webp'] as const)(
    'identifies and rejects animated %s rather than discarding frames',
    async (format) => {
      const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
      const input = await sharp(pixels, {
        raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
      })
        .toFormat(format, { loop: 0, delay: [100, 100] })
        .toBuffer();
      expect((await sharp(input).metadata()).pages).toBe(2);
      await expect(processStaticProbe(input)).rejects.toThrow(
        'Animated images',
      );
    },
  );

  it('fails on corrupt input and pixel-limit overflow', async () => {
    await expect(
      processStaticProbe(Buffer.from('not an image')),
    ).rejects.toThrow();
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();
    await expect(
      sharp(png, { limitInputPixels: 63 }).toBuffer(),
    ).rejects.toThrow(/pixel limit/i);
  });
});
