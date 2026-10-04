// Local presentation only: authoritative detection/animation/pixel validation is
// server-side. A renamed raster selected in the generic picker still gets an
// internal Markdown image at the cursor; SVG remains an ordinary download file.
export async function localImage(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  return (
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (bytes[0] === 0x89 && ascii(1, 3) === 'PNG') ||
    /^GIF8[79]a$/.test(ascii(0, 6)) ||
    (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') ||
    ascii(0, 2) === 'BM' ||
    (ascii(0, 2) === 'II' && bytes[2] === 42 && bytes[3] === 0) ||
    (ascii(0, 2) === 'MM' && bytes[2] === 0 && bytes[3] === 42) ||
    (ascii(4, 4) === 'ftyp' &&
      /^(avif|avis|heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8, 4))) ||
    /^(image\/(png|jpeg|webp|gif|avif|bmp|tiff))$/i.test(file.type) ||
    /\.(png|jpe?g|webp|gif|avif|bmp|tiff?)$/i.test(file.name)
  );
}
