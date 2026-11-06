import type { TranslationStatusResponse } from '@lingo-lens/shared';
import type { BatchJobStatus, BatchStatus } from '../azure/port';
import { classify, type Classification, type ClassifierInput } from './classifier';

/** Job states after which Translator no longer reads the Source file. */
export const TERMINAL_JOB_STATUSES: readonly BatchJobStatus[] = ['Succeeded', 'Failed', 'ValidationFailed', 'Cancelled'];

export const isTerminal = (status: BatchJobStatus) => TERMINAL_JOB_STATUSES.includes(status);

/**
 * The classifier's input for a batch job that ended without succeeding: the
 * document's error when there is one, otherwise the job's.
 */
export function batchFailureInput(batch: BatchStatus): ClassifierInput {
  const documentError = batch.document?.error;
  const error = documentError ?? batch.error;
  return {
    service: 'documentTranslation',
    scope: documentError ? 'document' : 'job',
    code: error?.code,
    innerCode: error?.innerErrorCode,
    jobStatus: batch.status,
    documentStatus: batch.document?.status,
  };
}

/** Azure's message for a failed batch (document first), for the log only. */
export const batchFailureMessage = (batch: BatchStatus) => (batch.document?.error ?? batch.error)?.message;

/** Maps a batch job's status to what the SPA sees. Failures go through the classifier. */
export function mapBatchStatus(batch: BatchStatus): TranslationStatusResponse {
  switch (batch.status) {
    case 'NotStarted':
    case 'Running':
    case 'Cancelling':
      return { status: 'translating' };
    case 'Succeeded':
      // Includes 0 characters charged (e.g. a scanned PDF): Completed, not an error.
      return { status: 'ready', kind: 'document' };
    default:
      return failedResponse(classify(batchFailureInput(batch)));
  }
}

export const failedResponse = ({ category, reason }: Classification): TranslationStatusResponse => ({
  status: 'failed',
  category,
  ...(reason ? { reason } : {}),
});
