import type { InvocationContext } from '@azure/functions';
import type { FailureCategory, FailureReason } from '@lingo-lens/shared';
import { AzureServiceError } from '../azure/port';
import type { Classification, ClassifierInput } from './classifier';

/**
 * The ONLY fields a Translation log line may carry (spec: "Logs record only GUIDs,
 * format, size, languages, durations and error codes"). Never add filenames,
 * content, extracted text, translations or SAS URLs.
 */
export interface TranslationLogFields {
  translationGuid: string;
  format?: string;
  sizeInBytes?: number;
  targetLanguage?: string;
  detectedLanguage?: string;
  /** Azure job status, e.g. `Succeeded`. */
  jobStatus?: string;
  /** Milliseconds since the Translation started. */
  durationMs?: number;
}

/** What `translation.failed` adds: the classifier's verdict and Azure's error, scrubbed. */
export interface TranslationErrorLogFields extends TranslationLogFields {
  category: FailureCategory;
  reason?: FailureReason;
  ruleId: string;
  /** False when only a fallback rule matched (see the "Unmapped Azure errors" saved query). */
  mapped: boolean;
  service: string;
  operation?: string;
  httpStatus?: number;
  errorCode?: string;
  innerErrorCode?: string;
  documentStatus?: string;
  /** Azure's `apim-request-id` / `X-RequestId`. */
  requestId?: string;
  /** Azure's message, URLs and SAS parameters redacted, at most 300 characters. */
  message?: string;
}

export function logEvent(context: InvocationContext, event: string, fields: TranslationLogFields): void {
  context.log(event, fields);
}

/** The retention sweep's summary (`sweep.completed`): counts only, no names. */
export interface SweepSummaryLogFields {
  cancelledBatches: number;
  deletedBlobs: number;
  deletedCounters: number;
  failures: number;
}

/** One step of the sweep that failed (`sweep.failed`): Azure's error, no blob names. */
export interface SweepFailureLogFields {
  service?: string;
  httpStatus?: number;
  errorCode?: string;
}

export function logSweepCompleted(context: InvocationContext, fields: SweepSummaryLogFields): void {
  context.log('sweep.completed', fields);
}

export function logSweepFailed(context: InvocationContext, error: unknown): void {
  const fields: SweepFailureLogFields =
    error instanceof AzureServiceError
      ? { service: error.service, httpStatus: error.httpStatus, ...(error.code ? { errorCode: error.code } : {}) }
      : { errorCode: 'unknown' };
  context.warn('sweep.failed', fields);
}

const MAX_MESSAGE_LENGTH = 300;
/** SAS query parameters, wherever they appear. */
const SAS_PARAMETER =
  /\b(sig|se|st|sp|sv|sr|spr|skoid|sktid|skt|ske|sks|skv|sdd|ss|srt|sip|saoid|suoid|scid)=[^&\s"']*/gi;

/** Any https URL, up to whitespace, a quote or a closing bracket. */
const HTTPS_URL = /https:\/\/[^\s"'<>()[\]{}]+/gi;

/**
 * Replaces every https URL (blob names, SAS, endpoints) with `REDACTED_URL`,
 * removes any SAS parameter values left outside a URL, and truncates to 300 characters.
 */
export function scrubMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return message.replace(HTTPS_URL, 'REDACTED_URL').replace(SAS_PARAMETER, '$1=REDACTED').slice(0, MAX_MESSAGE_LENGTH);
}

/** Logs a failed Translation as `translation.failed`, at the level the classifier chose. */
export function logFailure(
  context: InvocationContext,
  base: TranslationLogFields,
  input: ClassifierInput,
  classification: Classification,
  azure: { requestId?: string; message?: string } = {},
): void {
  const message = scrubMessage(azure.message);
  const fields: TranslationErrorLogFields = {
    ...base,
    category: classification.category,
    ...(classification.reason ? { reason: classification.reason } : {}),
    ruleId: classification.ruleId,
    mapped: classification.mapped,
    service: input.service,
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.httpStatus === undefined ? {} : { httpStatus: input.httpStatus }),
    ...(input.code ? { errorCode: input.code } : {}),
    ...(input.innerCode ? { innerErrorCode: input.innerCode } : {}),
    ...(input.jobStatus ? { jobStatus: input.jobStatus } : {}),
    ...(input.documentStatus ? { documentStatus: input.documentStatus } : {}),
    ...(azure.requestId ? { requestId: azure.requestId } : {}),
    ...(message ? { message } : {}),
  };
  if (classification.level === 'error') context.error('translation.failed', fields);
  else context.warn('translation.failed', fields);
}
