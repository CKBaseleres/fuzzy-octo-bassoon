import { AzureServiceError, type BatchStatus } from '../azure/port';
import type { HttpHandlerFactory } from '../deps';
import { sourceBlobName } from '../translations/blobNames';
import { classify, requestFailureInput, type ClassifierInput } from '../translations/classifier';
import { batchFailureInput, batchFailureMessage, failedResponse, isTerminal, mapBatchStatus } from '../translations/documentStatus';
import { notFound } from '../translations/http';
import { pollImageTranslation } from '../translations/imagePoll';
import { logEvent, logFailure } from '../translations/log';
import { blobsGone, EXPIRED, expiresWhenBlobsGone, isUnknownOperation } from '../translations/expiry';
import { decodeTranslationId } from '../translations/translationId';

/**
 * GET /api/translations/{id}: polls Azure and maps the job to the SPA's status.
 * The first poll that sees the job end deletes the Source file blob.
 * Expired (ticket 07): the job is unknown to Translator, or the Translation's blobs
 * are all gone (the sweep or a DELETE removed them) and the job did not fail.
 *
 * A job still running `DOCUMENT_TIMEOUT_MINUTES` after the start is cancelled and
 * reported as a Service problem (ticket 09). Other Azure errors (after the silent
 * retries) go through the classifier (translations/classifier.ts).
 *
 * Images are polled by `pollImageTranslation` (translations/imagePoll.ts).
 */
export const createGetTranslationHandler: HttpHandlerFactory =
  (deps) =>
  async (request, context) => {
    const { azure, clock, timeouts } = deps;
    const ref = decodeTranslationId(request.params.id);
    if (!ref) return notFound();
    if (ref.kind === 'image') {
      const status = await pollImageTranslation(deps, ref, context);
      return { status: 200, jsonBody: status };
    }
    const logBase = {
      translationGuid: ref.translationGuid,
      format: ref.extension,
      durationMs: clock.now().getTime() - ref.startedAt.getTime(),
    };

    let batch: BatchStatus;
    try {
      batch = await azure.documentTranslation.getBatchStatus(ref.operationId);
    } catch (error) {
      // An unknown job is Expired (ticket 07), ahead of the classifier.
      if (isUnknownOperation(error)) return { status: 200, jsonBody: EXPIRED };
      if (!(error instanceof AzureServiceError)) throw error;
      const input = requestFailureInput(error, 'getBatchStatus');
      const classification = classify(input);
      logFailure(context, logBase, input, classification, error);
      return { status: 200, jsonBody: failedResponse(classification) };
    }

    if (expiresWhenBlobsGone(batch.status) && (await blobsGone(azure.blobs, ref.translationGuid))) {
      return { status: 200, jsonBody: EXPIRED };
    }

    if (isTerminal(batch.status)) {
      const source = sourceBlobName(ref.translationGuid, ref.extension);
      if (await azure.blobs.getBlob(source)) {
        await azure.blobs.deleteBlob(source);
        logEvent(context, 'translation.batchEnded', { ...logBase, jobStatus: batch.status });
      }
    }

    if (isTerminal(batch.status) && batch.status !== 'Succeeded') {
      const input = batchFailureInput(batch);
      const classification = classify(input);
      logFailure(context, logBase, input, classification, {
        requestId: batch.requestId,
        message: batchFailureMessage(batch),
      });
      return { status: 200, jsonBody: failedResponse(classification) };
    }

    if (!isTerminal(batch.status) && logBase.durationMs >= timeouts.documentMinutes * 60_000) {
      // Best effort: the timer sweep is the backstop, and the SPA's DELETE cancels again.
      await azure.documentTranslation.cancelBatch(ref.operationId).catch(() => undefined);
      const input: ClassifierInput = { service: 'documentTranslation', scope: 'timeout', jobStatus: batch.status };
      const classification = classify(input);
      logFailure(context, logBase, input, classification);
      return { status: 200, jsonBody: failedResponse(classification) };
    }

    return { status: 200, jsonBody: mapBatchStatus(batch) };
  };
