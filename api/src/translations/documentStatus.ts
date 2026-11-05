import type { TranslationStatusResponse } from '@lingo-lens/shared';
import type { BatchJobStatus, BatchStatus } from '../azure/port';

/** Job states after which Translator no longer reads the Source file. */
export const TERMINAL_JOB_STATUSES: readonly BatchJobStatus[] = ['Succeeded', 'Failed', 'ValidationFailed', 'Cancelled'];

export const isTerminal = (status: BatchJobStatus) => TERMINAL_JOB_STATUSES.includes(status);

/**
 * Maps a batch job's status to what the SPA sees.
 *
 * Happy-path mapping only: every non-success ending is a Service problem.
 * Ticket 09 replaces the `failed` branch with the table-driven classifier
 * (input: job + document status and error codes; output: category, reason, ruleId).
 */
export function mapBatchStatus(batch: BatchStatus): TranslationStatusResponse {
  switch (batch.status) {
    case 'NotStarted':
    case 'Running':
    case 'Cancelling':
      return { status: 'translating' };
    case 'Succeeded':
      return { status: 'ready', kind: 'document' };
    default:
      return { status: 'failed', category: 'serviceProblem' };
  }
}
