import type { FailureCategory, FailureReason } from '@lingo-lens/shared';
import type { AzureServiceError, AzureServiceName } from '../azure/port';

/**
 * The error classifier (spec: "Error classification"): one pure, table-driven
 * function from what Azure said to the failure the SPA shows.
 *
 * Refining a rule is a one-row change plus a Seam 1 test that makes the fake
 * return the error and asserts on the poll (category, reason, and `ruleId` in
 * the `translation.failed` log). Rows are tried in order; the first match wins.
 */

/** Where the error code came from. */
export type ErrorScope =
  /** A port method threw an `AzureServiceError` (after retries). */
  | 'request'
  /** The job/operation itself reports the error (`BatchStatus.error`, `ReadOperation.error`). */
  | 'job'
  /** The single document in a batch reports the error (`BatchStatus.document.error`). */
  | 'document'
  /** Our own overall timeout ran out (no Azure error). */
  | 'timeout';

export interface ClassifierInput {
  service: AzureServiceName;
  scope: ErrorScope;
  /** The port method that failed, for `request` errors, e.g. `startBatch`. */
  operation?: string;
  httpStatus?: number;
  code?: string;
  innerCode?: string;
  /** Job or operation status, e.g. batch `ValidationFailed` or read `failed`. */
  jobStatus?: string;
  /** The batch document's status. */
  documentStatus?: string;
}

export interface Classification {
  category: FailureCategory;
  reason?: FailureReason;
  ruleId: string;
  /** False when only a fallback matched: the saved query "Unmapped Azure errors" finds these. */
  mapped: boolean;
  /** `error` for what is likely our fault (RBAC, bad request, unmapped); `warning` otherwise. */
  level: 'warning' | 'error';
}

/** The classifier's input for a port method that threw (after retries). */
export const requestFailureInput = (error: AzureServiceError, operation: string): ClassifierInput => ({
  service: error.service,
  scope: 'request',
  operation,
  httpStatus: error.httpStatus,
  code: error.code,
  innerCode: error.innerErrorCode,
});

/** A status-code matcher: exact codes, or a class such as `'5xx'`. */
export type HttpStatusMatch = number | '5xx';

/** Every listed field must match; an omitted field matches anything. */
export interface RuleMatch {
  service?: readonly AzureServiceName[];
  scope?: readonly ErrorScope[];
  operation?: readonly string[];
  httpStatus?: readonly HttpStatusMatch[];
  code?: readonly string[];
  /** Matches the inner code; `null` in the list matches "no inner code". */
  innerCode?: readonly (string | null)[];
  jobStatus?: readonly string[];
  documentStatus?: readonly string[];
}

export interface ClassifierRule {
  id: string;
  when: RuleMatch;
  category: FailureCategory;
  reason?: FailureReason;
  /** Defaults to `warning`. */
  level?: 'warning' | 'error';
}

const INVALID_INPUT = ['InvalidRequest', 'InvalidArgument'] as const;

/**
 * The rules. Ticket 10 appends its Document Intelligence and Translator text
 * rows here (service `documentIntelligence` / `textTranslation`), above `FALLBACKS`.
 */
export const RULES: readonly ClassifierRule[] = [
  // --- Any service ---
  {
    // Azure busy or down, and still so after the silent retries.
    id: 'azure.busy',
    when: { scope: ['request'], httpStatus: [429, '5xx'] },
    category: 'serviceProblem',
  },

  // --- Our own overall timeouts (the job is cancelled first) ---
  { id: 'document.timeout', when: { service: ['documentTranslation'], scope: ['timeout'] }, category: 'serviceProblem' },
  { id: 'image.timeout', when: { service: ['documentIntelligence'], scope: ['timeout'] }, category: 'serviceProblem' },

  // --- Translator batch Document Translation ---
  {
    id: 'batch.document.invalidRequest',
    when: { service: ['documentTranslation'], scope: ['document'], code: INVALID_INPUT, innerCode: [null] },
    category: 'cantTranslate',
  },
  {
    id: 'batch.document.serviceBusy',
    when: {
      service: ['documentTranslation'],
      scope: ['document'],
      code: ['ServiceUnavailable', 'InternalServerError', 'RequestRateTooHigh'],
    },
    // No automatic resubmit: the user's Try again does it.
    category: 'serviceProblem',
  },
  {
    // Likely the managed identity or Blob RBAC: our fault.
    id: 'batch.accessFailed',
    when: { service: ['documentTranslation'], scope: ['job', 'document'], code: ['Unauthorized', 'ResourceNotFound'] },
    category: 'serviceProblem',
    level: 'error',
  },
  {
    // Our request was wrong or not allowed (bad payload, RBAC, missing job): our fault.
    id: 'batch.request.rejected',
    when: { service: ['documentTranslation'], scope: ['request'], httpStatus: [400, 401, 403, 404] },
    category: 'serviceProblem',
    level: 'error',
  },
  {
    // Reached only when the document has no error of its own (that case matches a document row).
    id: 'batch.validationFailed',
    when: { service: ['documentTranslation'], scope: ['job'], jobStatus: ['ValidationFailed'] },
    category: 'serviceProblem',
  },
  {
    // We cancel only on DELETE (the SPA stops polling) and on timeout (reported before this).
    id: 'batch.cancelled',
    when: { service: ['documentTranslation'], scope: ['job'], jobStatus: ['Cancelled'] },
    category: 'serviceProblem',
  },
];

/** Tried after `RULES`; anything they match is logged with `mapped: false`. */
export const FALLBACKS: readonly ClassifierRule[] = [
  {
    // A retry won't help a file Azure called invalid, even when we don't know why.
    id: 'fallback.document.invalidRequest',
    when: { service: ['documentTranslation'], scope: ['document'], code: INVALID_INPUT },
    category: 'cantTranslate',
    level: 'error',
  },
];

const statusMatches = (status: number | undefined, matchers: readonly HttpStatusMatch[]) =>
  status !== undefined && matchers.some((m) => (m === '5xx' ? status >= 500 && status <= 599 : m === status));

const listMatches = <T>(value: T | undefined, list: readonly (T | null)[] | undefined) =>
  list === undefined || list.includes(value ?? null);

export function matches(rule: ClassifierRule, input: ClassifierInput): boolean {
  const w = rule.when;
  return (
    listMatches(input.service, w.service) &&
    listMatches(input.scope, w.scope) &&
    listMatches(input.operation, w.operation) &&
    (w.httpStatus === undefined || statusMatches(input.httpStatus, w.httpStatus)) &&
    listMatches(input.code, w.code) &&
    listMatches(input.innerCode, w.innerCode) &&
    listMatches(input.jobStatus, w.jobStatus) &&
    listMatches(input.documentStatus, w.documentStatus)
  );
}

const LAST_RESORT: ClassifierRule = { id: 'fallback', when: {}, category: 'serviceProblem', level: 'error' };

export function classify(input: ClassifierInput): Classification {
  const rule = RULES.find((r) => matches(r, input));
  const chosen = rule ?? FALLBACKS.find((r) => matches(r, input)) ?? LAST_RESORT;
  return {
    category: chosen.category,
    ...(chosen.reason ? { reason: chosen.reason } : {}),
    ruleId: chosen.id,
    mapped: rule !== undefined,
    level: chosen.level ?? (rule ? 'warning' : 'error'),
  };
}
