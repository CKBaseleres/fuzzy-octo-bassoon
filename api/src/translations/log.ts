import type { InvocationContext } from '@azure/functions';

/**
 * The ONLY fields a Translation log line may carry (spec: "Logs record only GUIDs,
 * format, size, languages, durations and error codes"). Never add filenames,
 * content, extracted text, translations or SAS URLs. Ticket 09 extends this with
 * the error fields (category, ruleId, service, httpStatus, codes, mapped...).
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

export function logEvent(context: InvocationContext, event: string, fields: TranslationLogFields): void {
  context.log(event, fields);
}
