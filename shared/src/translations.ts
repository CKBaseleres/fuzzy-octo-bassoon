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

export interface CreateUploadRequest {
  /** The Source file's extension, lower case, without the dot. The filename itself never leaves the browser. */
  extension: string;
}

export interface CreateUploadResponse {
  /** Server-generated GUID naming the Source file blob. */
  uploadId: string;
  /** Write-only user delegation SAS URL for exactly one blob. The browser `PUT`s the file here. */
  uploadUrl: string;
  /** ISO 8601. */
  expiresOn: string;
}

// --- POST /api/translations ----------------------------------------------------

export interface StartTranslationRequest {
  uploadId: string;
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

export type TranslationStatusResponse =
  | { status: 'translating' }
  | { status: 'ready'; kind: 'document' }
  | { status: 'failed'; category: FailureCategory; reason?: FailureReason };

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

/** Body of any 4xx the API returns for a bad request. */
export interface ApiErrorResponse {
  error: 'badRequest' | 'notFound';
  message?: string;
}
