import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

/** A file for `locator.setInputFiles`. */
export interface PickedFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** The committed Seam 2 fixtures (`web/scripts/make-fixtures.mjs`). */
const fixture = (name: string) => readFileSync(new URL(`../src/test/fixtures/${name}`, import.meta.url));

export const plainPdf = (name = 'report.pdf'): PickedFile => ({ name, mimeType: 'application/pdf', buffer: fixture('plain.pdf') });

export const encryptedPdf = (): PickedFile => ({
  name: 'locked.pdf',
  mimeType: 'application/pdf',
  buffer: fixture('encrypted.pdf'),
});

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/**
 * A real, decodable RGB PNG (the fixtures are header-only, which a browser
 * can't draw): a light "photo" with dark bars where the text blocks are, so
 * the layout and the highlight are checked over a real image.
 */
export function photoPng(width: number, height: number, name = 'sign.png'): PickedFile {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const bar = y % 80 > 20 && y % 80 < 50 && x > width * 0.1 && x < width * 0.9;
      const v = bar ? 40 : 200 + Math.round((x / width) * 50);
      raw.fill(v, row + 1 + x * 3, row + 4 + x * 3);
    }
  }
  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return { name, mimeType: 'image/png', buffer };
}
