import { DOCUMENT_EXTENSIONS, MAX_DOCUMENT_BYTES, isDocumentExtension, type DocumentExtension } from '@lingo-lens/shared';

/**
 * Browser checks (category 1: Rejected before upload). Ticket 05 adds Images
 * (IMAGE_EXTENSIONS, MAX_IMAGE_BYTES); ticket 11 adds the encryption and
 * dimension sniffing (async, reading the file's bytes).
 */
export type SourceFileCheck =
  | { ok: true; kind: 'document'; extension: DocumentExtension }
  | { ok: false; message: string };

/** Value for the file input's `accept` attribute. */
export const ACCEPT = DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',');

export const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export const baseNameOf = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

export function checkSourceFile(file: File): SourceFileCheck {
  const extension = extensionOf(file.name);
  if (!isDocumentExtension(extension)) {
    return {
      ok: false,
      message: 'This file type isn’t supported. Choose a PDF, Office, OpenDocument, text, web page or email file.',
    };
  }
  if (file.size === 0) return { ok: false, message: 'This file is empty. Choose another file.' };
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, message: 'This Document is larger than 40 MB. Choose a smaller file.' };
  }
  return { ok: true, kind: 'document', extension };
}

/** `Report.pdf` into `fr`, returned as `docx`... -> `Report.fr.pdf`. Built only in the browser. */
export const translatedFileName = (sourceName: string, targetLanguage: string, extension: string) =>
  `${baseNameOf(sourceName)}.${targetLanguage}.${extension}`;
