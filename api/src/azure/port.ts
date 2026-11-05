/**
 * The Azure services port: the ONE seam between the backend and Azure.
 *
 * Every Azure call a handler makes goes through `AzureServices`. Production wires
 * a real adapter (later tickets); tests wire `createFakeAzureServices()` from
 * `src/testing/fakeAzureServices.ts`. Do not add a second seam: grow this one.
 *
 * Growing it: add a method to the relevant sub-port here, implement it in the
 * real adapter, and give the fake an in-memory default plus a `script` entry so
 * tests can make it return statuses or throw `AzureServiceError`s.
 *
 * The shapes below mirror the Azure REST payloads the spec relies on, trimmed to
 * the fields the backend reads. Nothing calls most of them yet; later tickets may
 * rename or reshape them freely, as long as port, adapter and fake move together.
 */
export interface AzureServices {
  /** Translator batch Document Translation (GA 2026-03-01). */
  documentTranslation: DocumentTranslationPort;
  /** Document Intelligence `prebuilt-read` (v4.0 2024-11-30). */
  documentIntelligence: DocumentIntelligencePort;
  /** Translator text (NMT, source language auto-detected). */
  textTranslation: TextTranslationPort;
  /** Blob Storage, including user delegation SAS. */
  blobs: BlobPort;
  /** Table Storage quota counters. */
  counters: CounterPort;
}

export type AzureServiceName = keyof AzureServices;

/** An Azure error body, `{ error: { code, message, innerError: { code } } }`. */
export interface AzureErrorBody {
  code: string;
  message?: string;
  innerErrorCode?: string;
}

/**
 * Thrown by any port method when Azure answers with an error. Carries exactly
 * the inputs the error classifier needs: service, HTTP status, code, inner code.
 */
export class AzureServiceError extends Error {
  readonly service: AzureServiceName;
  readonly httpStatus: number;
  readonly code: string | undefined;
  readonly innerErrorCode: string | undefined;

  constructor(init: { service: AzureServiceName; httpStatus: number } & Partial<AzureErrorBody>) {
    super(init.message ?? `${init.service} responded ${init.httpStatus}${init.code ? ` ${init.code}` : ''}`);
    this.name = 'AzureServiceError';
    this.service = init.service;
    this.httpStatus = init.httpStatus;
    this.code = init.code;
    this.innerErrorCode = init.innerErrorCode;
  }
}

// --- Translator batch Document Translation ---------------------------------

export type BatchJobStatus =
  | 'NotStarted'
  | 'Running'
  | 'Succeeded'
  | 'Failed'
  | 'Cancelled'
  | 'Cancelling'
  | 'ValidationFailed';

export interface BatchDocumentStatus {
  status: BatchJobStatus;
  characterCharged?: number;
  error?: AzureErrorBody;
}

export interface BatchStatus {
  status: BatchJobStatus;
  error?: AzureErrorBody;
  /** The single document in the batch, once Azure reports it. */
  document?: BatchDocumentStatus;
}

export interface DocumentTranslationPort {
  startBatch(request: {
    sourceBlobName: string;
    targetBlobName: string;
    targetLanguage: string;
  }): Promise<{ operationId: string }>;
  getBatchStatus(operationId: string): Promise<BatchStatus>;
  cancelBatch(operationId: string): Promise<void>;
  /**
   * Operation ids of jobs still `NotStarted` or `Running` that were created before
   * `createdBefore` (Translator's list endpoint, filtered by status and creation time).
   */
  listActiveBatches(createdBefore: Date): Promise<string[]>;
}

// --- Document Intelligence prebuilt-read ------------------------------------

export type ReadStatus = 'notStarted' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface ReadParagraph {
  content: string;
  /** Flat [x1, y1, x2, y2, ...] in page units (pixels for Images). */
  polygon: number[];
}

export interface ReadResult {
  page: { width: number; height: number };
  paragraphs: ReadParagraph[];
  isHandwritten: boolean;
}

export interface ReadOperation {
  status: ReadStatus;
  error?: AzureErrorBody;
  result?: ReadResult;
}

export interface DocumentIntelligencePort {
  startRead(request: { sourceUrl: string }): Promise<{ operationId: string }>;
  getReadResult(operationId: string): Promise<ReadOperation>;
  deleteReadResult(operationId: string): Promise<void>;
}

// --- Translator text --------------------------------------------------------

export interface TextTranslation {
  text: string;
  detectedLanguage?: string;
}

export interface TargetLanguage {
  code: string;
  /** English display name. */
  name: string;
}

export interface TextTranslationPort {
  /** One output element per input element, in the same order. */
  translate(request: { texts: string[]; targetLanguage: string }): Promise<TextTranslation[]>;
  /** Every language Translator can translate into (the `translation` scope of `/languages`). */
  listLanguages(): Promise<TargetLanguage[]>;
}

// --- Blob Storage -----------------------------------------------------------

export interface BlobInfo {
  name: string;
  sizeInBytes: number;
  createdOn: Date;
}

/**
 * Blob names are `<container>/<path>`, e.g. `source/<guid>/file.pdf`
 * (see `src/translations/blobNames.ts`).
 */
export interface BlobPort {
  /** Write-only (create + write) user delegation SAS URL for one blob. */
  createUploadUrl(blobName: string, expiresOn: Date): Promise<string>;
  /** Read-only user delegation SAS URL for one blob. */
  createReadUrl(blobName: string, expiresOn: Date): Promise<string>;
  getBlob(blobName: string): Promise<BlobInfo | undefined>;
  /** `prefix` starts with the container name, e.g. `source/` or `target/<guid>/`. */
  listBlobs(prefix: string): Promise<BlobInfo[]>;
  /** Deleting a blob that does not exist is not an error. */
  deleteBlob(blobName: string): Promise<void>;
}

// --- Table Storage counters -------------------------------------------------

export interface CounterKey {
  partitionKey: string;
  rowKey: string;
}

export interface CounterPort {
  get(key: CounterKey): Promise<number>;
  /** Adds one and returns the new count. */
  increment(key: CounterKey): Promise<number>;
}
