export interface Dimensions {
  width: number;
  height: number;
}

/** Enough to reach a JPEG's frame header past large EXIF/ICC segments, or a HEIF's `meta` box. */
const HEADER_BYTES = 512 * 1024;

/**
 * An Image's pixel size, read from its header (PNG, JPEG, BMP, TIFF, HEIF) so it
 * is fast and deterministic, with a browser decode as the fallback. Undefined when
 * neither works: the caller lets the Image through and Azure has the final say.
 */
export async function readImageDimensions(file: File): Promise<Dimensions | undefined> {
  const head = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  return fromHeader(head) ?? (await decode(file));
}

function fromHeader(bytes: Uint8Array): Dimensions | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return png(view);
    if (startsWith(bytes, [0xff, 0xd8])) return jpeg(view);
    if (startsWith(bytes, [0x42, 0x4d])) return bmp(view);
    if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return tiff(view);
    if (ascii(bytes, 4, 4) === 'ftyp') return heif(bytes, view);
  } catch {
    // A truncated or odd header (DataView RangeError): fall back to decoding.
  }
  return undefined;
}

const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((byte, i) => bytes[i] === byte);

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

/** IHDR is always the first chunk: width and height at bytes 16 and 20. */
const png = (view: DataView): Dimensions => ({ width: view.getUint32(16), height: view.getUint32(20) });

/** Walk the marker segments to the first start-of-frame (SOF0-SOF15, except DHT/JPG/DAC). */
function jpeg(view: DataView): Dimensions | undefined {
  let at = 2;
  while (at + 9 < view.byteLength) {
    if (view.getUint8(at) !== 0xff) return undefined;
    const marker = view.getUint8(at + 1);
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2; // standalone marker
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return undefined; // end of image / scan before any frame
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    }
    at += 2 + view.getUint16(at + 2);
  }
  return undefined;
}

/** BITMAPCOREHEADER (12 bytes) has 16-bit sizes; later headers have signed 32-bit ones (negative = top-down). */
function bmp(view: DataView): Dimensions {
  if (view.getUint32(14, true) === 12) return { width: view.getUint16(18, true), height: view.getUint16(20, true) };
  return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
}

/** ImageWidth (256) and ImageLength (257) from the first IFD, SHORT or LONG. */
function tiff(view: DataView): Dimensions | undefined {
  const little = view.getUint8(0) === 0x49;
  const ifd = view.getUint32(4, little);
  const count = view.getUint16(ifd, little);
  let width: number | undefined;
  let height: number | undefined;
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    const tag = view.getUint16(entry, little);
    if (tag !== 256 && tag !== 257) continue;
    const value = view.getUint16(entry + 2, little) === 3 ? view.getUint16(entry + 8, little) : view.getUint32(entry + 8, little);
    if (tag === 256) width = value;
    else height = value;
  }
  return width !== undefined && height !== undefined ? { width, height } : undefined;
}

/**
 * HEIF stores each item's size in an `ispe` property (version/flags, width, height).
 * Thumbnails and grid tiles have their own, so the largest one is the full Image.
 */
function heif(bytes: Uint8Array, view: DataView): Dimensions | undefined {
  let largest: Dimensions | undefined;
  for (let at = bytes.indexOf(0x69); at >= 0 && at + 16 <= bytes.length; at = bytes.indexOf(0x69, at + 1)) {
    if (ascii(bytes, at, 4) !== 'ispe') continue;
    const size = { width: view.getUint32(at + 8), height: view.getUint32(at + 12) };
    if (!largest || size.width * size.height > largest.width * largest.height) largest = size;
  }
  return largest;
}

async function decode(file: File): Promise<Dimensions | undefined> {
  if (typeof createImageBitmap !== 'function') return undefined;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return undefined;
  }
}
