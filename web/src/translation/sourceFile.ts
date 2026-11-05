import {
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  isDocumentExtension,
  isImageExtension,
  type DocumentExtension,
  type ImageExtension,
} from '@lingo-lens/shared';
import { readImageDimensions, type Dimensions } from './imageDimensions';

/**
 * Browser checks (category 1: Rejected before upload): type, size, empty, then
 * sniffing the file's bytes for OOXML/PDF encryption and Image dimensions.
 */
export type SourceFileCheck =
  | { ok: true; kind: 'document'; extension: DocumentExtension }
  | { ok: true; kind: 'image'; extension: ImageExtension }
  | { ok: false; message: string };

/** Value for the file input's `accept` attribute. */
export const ACCEPT = [...DOCUMENT_EXTENSIONS, ...IMAGE_EXTENSIONS].map((ext) => `.${ext}`).join(',');

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export const baseNameOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

/** Category 1 wording, owned here (ticket 09's category 4 `passwordProtected` can reuse it). */
export const PROTECTED_MESSAGE = 'This file is password-protected or encrypted. Remove the protection and try again.';
/** Same words as category 4 `badDimensions` (ticket 09 owns that one; keep them in step). */
export const BAD_DIMENSIONS_MESSAGE = 'This image is too small or too large to read.';

export async function checkSourceFile(file: File): Promise<SourceFileCheck> {
  const check = checkTypeAndSize(file);
  if (!check.ok) return check;
  if (check.kind === 'document' && (await isProtected(file, check.extension))) {
    return { ok: false, message: PROTECTED_MESSAGE };
  }
  if (check.kind === 'image' && !withinImageLimits(await readImageDimensions(file))) {
    return { ok: false, message: BAD_DIMENSIONS_MESSAGE };
  }
  return check;
}

/** Document Intelligence reads Images from 50 to 10,000 px on each side. */
const MIN_IMAGE_SIDE = 50;
const MAX_IMAGE_SIDE = 10_000;

/** An Image whose size can't be read here goes through: Azure has the final say (category 4 `badDimensions`). */
const withinImageLimits = (size: Dimensions | undefined) =>
  !size ||
  [size.width, size.height].every((side) => side >= MIN_IMAGE_SIDE && side <= MAX_IMAGE_SIDE);

function checkTypeAndSize(file: File): SourceFileCheck {
  const extension = extensionOf(file.name);
  if (isImageExtension(extension)) {
    if (file.size === 0) return { ok: false, message: 'This file is empty. Choose another file.' };
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false, message: 'This Image is larger than 20 MB. Choose a smaller file.' };
    }
    return { ok: true, kind: 'image', extension };
  }
  if (!isDocumentExtension(extension)) {
    return {
      ok: false,
      message:
        'This file type isn’t supported. Choose a PDF, Office, OpenDocument, text, web page or email file, or a JPEG, PNG, BMP, TIFF or HEIF Image.',
    };
  }
  if (file.size === 0) return { ok: false, message: 'This file is empty. Choose another file.' };
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, message: 'This Document is larger than 40 MB. Choose a smaller file.' };
  }
  return { ok: true, kind: 'document', extension };
}

const OOXML_EXTENSIONS: readonly string[] = ['docx', 'xlsx', 'pptx'];
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];
const PDF_TAIL_BYTES = 64 * 1024;

/**
 * An encrypted .docx/.xlsx/.pptx is an OLE Compound File (`D0 CF 11 E0`), not a ZIP.
 * An encrypted PDF names its `/Encrypt` dictionary in the trailer, near the end.
 */
async function isProtected(file: File, extension: DocumentExtension) {
  if (OOXML_EXTENSIONS.includes(extension)) {
    const head = await readBytes(file.slice(0, OLE_SIGNATURE.length));
    return OLE_SIGNATURE.every((byte, i) => head[i] === byte);
  }
  if (extension === 'pdf') {
    const tail = await readBytes(file.slice(Math.max(0, file.size - PDF_TAIL_BYTES)));
    return latin1(tail).includes('/Encrypt');
  }
  return false;
}

const readBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

/** `Report.pdf` into `fr`, returned as `docx`... -> `Report.fr.pdf`. Built only in the browser. */
export const translatedFileName = (sourceName: string, targetLanguage: string, extension: string) =>
  `${baseNameOf(sourceName)}.${targetLanguage}.${extension}`;
