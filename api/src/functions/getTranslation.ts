import { AzureServiceError, type BatchStatus } from '../azure/port';
import type { HttpHandlerFactory } from '../deps';
import { sourceBlobName } from '../translations/blobNames';
import { classify, requestFailureInput } from '../translations/classifier';
import { batchFailureInput, batchFailureMessage, failedResponse, isTerminal, mapBatchStatus } from '../translations/documentStatus';
import { notFound } from '../translations/http';
import { logEvent, logFailure } from '../translations/log';
import { decodeTranslationId } from '../translations/translationId';

/**
 * GET /api/translations/{id}: polls Azure and maps the job to the SPA's status.
 * The first poll that sees the job end deletes the Source file blob.
 *
 * Plug-in points: 05 adds the `ref.kind === 'image'` branch; 07 reports Expired when
 * the blobs are gone.
 */
export const createGetTranslationHandler: HttpHandlerFactory =
  ({ azure, clock }) =>
  async (request, context) => {
    const ref = decodeTranslationId(request.params.id);
    if (!ref || ref.kind !== 'document') return notFound();
    const logBase = {
      translationGuid: ref.guid,
      format: ref.extension,
      durationMs: clock.now().getTime() - ref.startedAt.getTime(),
    };

    let batch: BatchStatus;
    try {
      batch = await azure.documentTranslation.getBatchStatus(ref.operationId);
    } catch (error) {
      if (!(error instanceof AzureServiceError)) throw error;
      const input = requestFailureInput(error, 'getBatchStatus');
      const classification = classify(input);
      logFailure(context, logBase, input, classification, error);
      return { status: 200, jsonBody: failedResponse(classification) };
    }

    if (isTerminal(batch.status)) {
      const source = sourceBlobName(ref.guid, ref.extension);
      if (await azure.blobs.getBlob(source)) {
        await azure.blobs.deleteBlob(source);
        logEvent(context, 'translation.jobEnded', { ...logBase, jobStatus: batch.status });
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

    return { status: 200, jsonBody: mapBatchStatus(batch) };
  };
