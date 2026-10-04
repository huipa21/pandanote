import { crc32 } from 'node:zlib';
import sharp from 'sharp';

function chunk(type: string, body: Buffer): Buffer {
  const tag = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, body])));
  return Buffer.concat([length, tag, body, crc]);
}
function frame(sequence: number): Buffer {
  const value = Buffer.alloc(26);
  value.writeUInt32BE(sequence, 0);
  value.writeUInt32BE(1, 4);
  value.writeUInt32BE(1, 8);
  value.writeUInt16BE(1, 20);
  value.writeUInt16BE(10, 22);
  return value;
}
function idat(png: Buffer): Buffer {
  const values: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT')
      values.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  return Buffer.concat(values);
}
/** Two real frames with valid CRCs/deflate streams. Sharp/libvips currently reads
 * only the first APNG frame; product container validation must still reject it. */
export async function animatedPng(): Promise<Buffer> {
  const make = (background: string) =>
    sharp({ create: { width: 1, height: 1, channels: 4, background } })
      .png()
      .toBuffer();
  const [red, blue] = await Promise.all([make('red'), make('blue')]);
  const control = Buffer.alloc(8);
  control.writeUInt32BE(2);
  const sequence = Buffer.alloc(4);
  sequence.writeUInt32BE(3);
  return Buffer.concat([
    red.subarray(0, 8),
    red.subarray(8, 33),
    chunk('acTL', control),
    chunk('fcTL', frame(0)),
    chunk('IDAT', idat(red)),
    chunk('fcTL', frame(2)),
    chunk('fdAT', Buffer.concat([sequence, idat(blue)])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
