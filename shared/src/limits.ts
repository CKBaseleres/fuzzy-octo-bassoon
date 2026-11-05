// Limits and guardrails (ticket 08): quota refusals and the server-side size check.

/**
 * Which limit refused the Translation. `daily` also covers the kill switch: both
 * show "Lingo Lens has reached today's limit. Try again tomorrow."
 */
export type QuotaLimit = 'hourly' | 'daily';

/** Body of a 429. The `Retry-After` header carries the wait in seconds. */
export interface RefusedResponse {
  error: 'refused';
  limit: QuotaLimit;
}

/** Body of a 413: the uploaded Source file is over its size limit (and was deleted). */
export interface TooLargeResponse {
  error: 'tooLarge';
  /** The limit that applied, in bytes. */
  maxBytes: number;
}
