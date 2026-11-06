import type { InvocationContext } from '@azure/functions';
import type { ImageParagraph, TranslationStatusResponse } from '@lingo-lens/shared';
import { AzureServiceError, type ReadOperation } from '../azure/port';
import type { Deps } from '../deps';
import { sourceBlobName } from './blobNames';
import { classify, requestFailureInput, type ClassifierInput } from './classifier';
import { failedResponse } from './documentStatus';
import { EXPIRED, isUnknownOperation } from './expiry';
import { hasText, isReadTerminal, mostCommonLanguage, translateParagraphs } from './imageStatus';
import { logEvent, logFailure, type TranslationLogFields } from './log';
import type { ImageTranslationRef } from './translationId';

/**
 * One poll of an Image Translation (spec: "API contract", "Error classification").
 *
 * The first poll that sees the Translation end, well or badly, deletes the
 * Image blob and calls Delete Analyze Result, and returns the whole outcome:
 * after it, Azure keeps nothing, so the SPA stops polling on ready or failed.
 * Failures (each through the classifier, each cleaned up the same way):
 *   - a failed read, or a read result Azure keeps failing to return
 *   - OCR `succeeded` but no paragraph holds a letter or digit -> No text found
 *   - any Translator call still failing after retries -> the whole Image fails (no partial result)
 *   - OCR still running `IMAGE_TIMEOUT_MINUTES` after the start -> Service problem
 * A vanished analyze result (404) is Expired (ticket 07's rule).
 */
export async function pollImageTranslation(
  { azure, clock, timeouts }: Deps,
  ref: ImageTranslationRef,
  context: InvocationContext,
): Promise<TranslationStatusResponse> {
  const durationMs = clock.now().getTime() - ref.startedAt.getTime();
  const logBase: TranslationLogFields = { translationGuid: ref.translationGuid, format: ref.extension, durationMs };

  /** Deletes what Azure still holds. Delete Analyze Result is best effort: Azure purges it within 24 h anyway. */
  const cleanUp = async () => {
    await azure.blobs.deleteBlob(sourceBlobName(ref.translationGuid, ref.extension));
    try {
      await azure.documentIntelligence.deleteReadResult(ref.operationId);
    } catch (error) {
      if (!(error instanceof AzureServiceError)) throw error;
    }
  };

  const fail = async (
    input: ClassifierInput,
    azureError: { requestId?: string; message?: string } = {},
  ): Promise<TranslationStatusResponse> => {
    await cleanUp();
    const classification = classify(input);
    logFailure(context, logBase, input, classification, azureError);
    return failedResponse(classification);
  };

  let read: ReadOperation;
  try {
    read = await azure.documentIntelligence.getReadResult(ref.operationId);
  } catch (error) {
    // Deleted after the outcome poll (or purged by Azure after 24 h): nothing is left to show.
    if (isUnknownOperation(error)) return EXPIRED;
    if (!(error instanceof AzureServiceError)) throw error;
    return fail(requestFailureInput(error, 'getReadResult'), error);
  }

  if (!isReadTerminal(read.status)) {
    if (durationMs < timeouts.imageMinutes * 60_000) return { status: 'translating' };
    return fail({ service: 'documentIntelligence', scope: 'timeout', jobStatus: read.status });
  }

  if (read.status !== 'succeeded' || !read.result) {
    logEvent(context, 'translation.batchEnded', { ...logBase, jobStatus: read.status });
    return fail(
      {
        service: 'documentIntelligence',
        scope: 'job',
        jobStatus: read.status,
        ...(read.error ? { code: read.error.code } : {}),
        ...(read.error?.innerErrorCode ? { innerCode: read.error.innerErrorCode } : {}),
      },
      { message: read.error?.message },
    );
  }

  if (!hasText(read.result)) {
    logEvent(context, 'translation.batchEnded', { ...logBase, jobStatus: read.status });
    return fail({ service: 'documentIntelligence', scope: 'job', jobStatus: read.status });
  }

  let paragraphs: ImageParagraph[];
  try {
    paragraphs = await translateParagraphs(azure, read.result, ref.targetLanguage);
  } catch (error) {
    logEvent(context, 'translation.batchEnded', { ...logBase, jobStatus: read.status });
    if (error instanceof AzureServiceError) return fail(requestFailureInput(error, 'translate'), error);
    // E.g. Translator answered fewer results than texts: still no partial result.
    const message = error instanceof Error ? error.message : String(error);
    return fail({ service: 'textTranslation', scope: 'request', operation: 'translate' }, { message });
  }

  await cleanUp();
  const detectedLanguage = mostCommonLanguage(paragraphs);
  logEvent(context, 'translation.batchEnded', {
    ...logBase,
    jobStatus: read.status,
    ...(detectedLanguage ? { detectedLanguage } : {}),
  });
  return {
    status: 'ready',
    kind: 'image',
    page: { width: read.result.page.width, height: read.result.page.height },
    paragraphs,
    ...(detectedLanguage ? { detectedLanguage } : {}),
    isHandwritten: read.result.isHandwritten,
  };
}
