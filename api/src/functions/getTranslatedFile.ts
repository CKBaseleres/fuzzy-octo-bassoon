import {
  isDocumentExtension,
  translatedExtension,
  type ApiErrorResponse,
  type TranslatedFileResponse,
} from '@lingo-lens/shared';
import type { HttpHandlerFactory } from '../deps';
import { targetBlobName } from '../translations/blobNames';
import { blobsGone } from '../translations/expiry';
import { notFound } from '../translations/http';
import { decodeTranslationId } from '../translations/translationId';

export const DOWNLOAD_SAS_MINUTES = 5;

/**
 * GET /api/translations/{id}/file: a read-only SAS for the Translated file.
 * No Translated file: 404 while the job may still write it, 410 `expired` once every
 * blob of the Translation is gone (the sweep or a DELETE removed them).
 */
export const createGetTranslatedFileHandler: HttpHandlerFactory =
  ({ azure, clock }) =>
  async (request) => {
    const ref = decodeTranslationId(request.params.id);
    if (!ref || ref.kind !== 'document' || !isDocumentExtension(ref.extension)) return notFound();

    const extension = translatedExtension(ref.extension);
    const target = targetBlobName(ref.guid, extension);
    if (!(await azure.blobs.getBlob(target))) {
      if (await blobsGone(azure.blobs, ref.guid)) return { status: 410, jsonBody: { error: 'expired' } satisfies ApiErrorResponse };
      return notFound();
    }

    const expiresOn = new Date(clock.now().getTime() + DOWNLOAD_SAS_MINUTES * 60_000);
    const url = await azure.blobs.createReadUrl(target, expiresOn);
    const response: TranslatedFileResponse = { url, expiresOn: expiresOn.toISOString(), extension };
    return { status: 200, jsonBody: response };
  };
