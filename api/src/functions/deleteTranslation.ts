import { AzureServiceError } from '../azure/port';
import type { HttpHandlerFactory } from '../deps';
import { blobPrefixes } from '../translations/blobNames';
import { isTerminal } from '../translations/documentStatus';
import { notFound } from '../translations/http';
import { logEvent } from '../translations/log';
import { decodeTranslationId } from '../translations/translationId';

/**
 * DELETE /api/translations/{id}: removes every blob of the Translation and cancels
 * a job that is still running. Idempotent. The SPA calls it after a successful
 * save, and (ticket 09) best-effort after any failure.
 * For an Image it calls Delete Analyze Result instead of cancelling a job.
 */
export const createDeleteTranslationHandler: HttpHandlerFactory =
  ({ azure }) =>
  async (request, context) => {
    const ref = decodeTranslationId(request.params.id);
    if (!ref) return notFound();

    if (ref.kind === 'document') {
      try {
        const batch = await azure.documentTranslation.getBatchStatus(ref.operationId);
        if (!isTerminal(batch.status)) await azure.documentTranslation.cancelBatch(ref.operationId);
      } catch (error) {
        // A job Azure no longer knows (or cannot cancel) must not keep the blobs alive.
        if (!(error instanceof AzureServiceError)) throw error;
      }
    } else {
      try {
        // Delete Analyze Result: the stored Image copy and the OCR output go now, not after 24 h.
        await azure.documentIntelligence.deleteReadResult(ref.operationId);
      } catch (error) {
        if (!(error instanceof AzureServiceError)) throw error;
      }
    }

    for (const prefix of blobPrefixes(ref.translationGuid)) {
      for (const blob of await azure.blobs.listBlobs(prefix)) await azure.blobs.deleteBlob(blob.name);
    }

    logEvent(context, 'translation.deleted', { translationGuid: ref.translationGuid, format: ref.extension });
    return { status: 204 };
  };
