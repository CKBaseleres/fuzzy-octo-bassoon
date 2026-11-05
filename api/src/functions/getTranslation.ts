import type { HttpHandlerFactory } from '../deps';
import { sourceBlobName } from '../translations/blobNames';
import { isTerminal, mapBatchStatus } from '../translations/documentStatus';
import { notFound } from '../translations/http';
import { logEvent } from '../translations/log';
import { decodeTranslationId } from '../translations/translationId';

/**
 * GET /api/translations/{id}: polls Azure and maps the job to the SPA's status.
 * The first poll that sees the job end deletes the Source file blob.
 *
 * Plug-in points: 05 adds the `ref.kind === 'image'` branch; 07 reports Expired when
 * the blobs are gone; 09 adds the timeout (`ref.startedAt`), retries and classifier.
 */
export const createGetTranslationHandler: HttpHandlerFactory =
  ({ azure, clock }) =>
  async (request, context) => {
    const ref = decodeTranslationId(request.params.id);
    if (!ref || ref.kind !== 'document') return notFound();

    const batch = await azure.documentTranslation.getBatchStatus(ref.operationId);

    if (isTerminal(batch.status)) {
      const source = sourceBlobName(ref.guid, ref.extension);
      if (await azure.blobs.getBlob(source)) {
        await azure.blobs.deleteBlob(source);
        logEvent(context, 'translation.jobEnded', {
          translationGuid: ref.guid,
          format: ref.extension,
          jobStatus: batch.status,
          durationMs: clock.now().getTime() - ref.startedAt.getTime(),
        });
      }
    }

    return { status: 200, jsonBody: mapBatchStatus(batch) };
  };
