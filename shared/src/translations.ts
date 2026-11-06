// The Translation API contract (spec: "API contract (shared types)").
// The SPA owns all wording; the API returns only codes.

/** Document formats the batch Document Translation API accepts (lower case, no dot). */
export const DOCUMENT_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
  'md',
  'html',
  'htm',
  'mhtml',
  'mht',
  'msg',
  'txt',
  'csv',
  'tsv',
  'tab',
  'xlf',
] as const;
export type DocumentExtension = (typeof DOCUMENT_EXTENSIONS)[number];

/** Image formats (Document Intelligence `prebuilt-read`). Ticket 05 wires the Image pipeline. */
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'tif', 'tiff', 'heif', 'heic'] as const;
export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

export type SourceKind = 'document' | 'image';

export const MAX_DOCUMENT_BYTES = 40 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function isDocumentExtension(ext: string): ext is DocumentExtension {
  return (DOCUMENT_EXTENSIONS as readonly string[]).includes(ext);
}

export function isImageExtension(ext: string): ext is ImageExtension {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Batch Document Translation converts legacy and ODF formats, so the Translated
 * file's extension can differ from the Source file's.
 */
export function translatedExtension(sourceExtension: DocumentExtension): DocumentExtension {
  switch (sourceExtension) {
    case 'doc':
    case 'odt':
    case 'rtf':
      return 'docx';
    case 'xls':
    case 'ods':
      return 'xlsx';
    case 'ppt':
    case 'odp':
      return 'pptx';
    default:
      return sourceExtension;
  }
}

// --- GET /api/languages -----------------------------------------------------

export interface Language {
  /** Translator language code, e.g. `fr`, `zh-Hans`. */
  code: string;
  /** English display name, e.g. `French`. */
  name: string;
}

export interface LanguagesResponse {
  languages: Language[];
}

// --- POST /api/translations/uploads ------------------------------------------

export interface CreateUploadBody {
  /** The Source file's extension, lower case, without the dot. The filename itself never leaves the browser. */
  extension: string;
}

export interface CreateUploadResponse {
  /** Server-generated GUID naming the Source file blob. */
  translationGuid: string;
  /** Write-only user delegation SAS URL for exactly one blob. The browser `PUT`s the file here. */
  uploadUrl: string;
  /** ISO 8601. */
  expiresOn: string;
}

// --- POST /api/translations ----------------------------------------------------

export interface StartTranslationBody {
  translationGuid: string;
  extension: string;
  /** Translator language code. The source language is auto-detected. */
  targetLanguage: string;
}

export interface StartTranslationResponse {
  /** Opaque Translation id. The SPA never parses it. */
  id: string;
}

// --- GET /api/translations/{id} -------------------------------------------------

/** Failure categories 2-7 of the spec (category 1 never reaches the API). */
export type FailureCategory = 'uploadFailed' | 'refused' | 'cantTranslate' | 'noTextFound' | 'serviceProblem' | 'expired';

export type FailureReason = 'passwordProtected' | 'damaged' | 'badDimensions';

/** One paragraph of an Image, as `prebuilt-read` found it, with its translation. */
export interface ImageParagraph {
  /**
   * Flat `[x1, y1, x2, y2, ...]` in the page's pixel units, clockwise from the
   * top-left, exactly as Document Intelligence returns it. Draw it in an SVG
   * whose `viewBox` is `0 0 page.width page.height`.
   */
  polygon: number[];
  /** The text read from the Image. */
  original: string;
  /** The text in the target language. */
  translation: string;
  /** Translator's auto-detected source language for this paragraph, if any. */
  detectedLanguage?: string;
}

/** The result of an Image Translation. Azure keeps none of it. */
export interface ImageTranslationReady {
  /** The analysed page's size in pixels. */
  page: { width: number; height: number };
  /** In reading order. Empty when no text was found (ticket 10 turns that into `noTextFound`). */
  paragraphs: ImageParagraph[];
  /** The most common detected language across the paragraphs. */
  detectedLanguage?: string;
  /** Some of the text is handwritten. */
  isHandwritten: boolean;
}

export type TranslationStatusResponse =
  | { status: 'translating' }
  | { status: 'ready'; kind: 'document' }
  | ({ status: 'ready'; kind: 'image' } & ImageTranslationReady)
  | { status: 'failed'; category: FailureCategory; reason?: FailureReason };

/**
 * A failed Translation. The poll returns it with 200; `POST /api/translations`
 * returns it with **502** when Azure refuses the batch submit (the Source file is
 * then already deleted, and there is no Translation id to DELETE).
 */
export type FailedTranslationResponse = Extract<TranslationStatusResponse, { status: 'failed' }>;

// --- GET /api/translations/{id}/file --------------------------------------------

export interface TranslatedFileResponse {
  /** Read-only SAS URL, 5-minute expiry. */
  url: string;
  /** ISO 8601. */
  expiresOn: string;
  /** Extension of the Translated file (may differ from the Source file's, e.g. doc -> docx). */
  extension: string;
}

// --- Errors ----------------------------------------------------------------------

/** Body of any 4xx the API returns. `expired` comes with 410 from `GET /api/translations/{id}/file`. */
export interface ApiErrorResponse {
  error: 'badRequest' | 'notFound' | 'expired';
  message?: string;
}
