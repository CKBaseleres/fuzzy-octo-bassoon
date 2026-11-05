import { isDocumentExtension, translatedExtension, type TranslatedFileResponse } from '@lingo-lens/shared';
import type { HttpHandlerFactory } from '../deps';
import { targetBlobName } from '../translations/blobNames';
import { notFound } from '../translations/http';
import { decodeTranslationId } from '../translations/translationId';

export const DOWNLOAD_SAS_MINUTES = 5;

/**
 * GET /api/translations/{id}/file: a read-only SAS for the Translated file.
 * Ticket 07 turns the "no Translated file" 404 into Expired once the sweep has run.
 */
export const createGetTranslatedFileHandler: HttpHandlerFactory =
  ({ azure, clock }) =>
  async (request) => {
    const ref = decodeTranslationId(request.params.id);
    if (!ref || ref.kind !== 'document' || !isDocumentExtension(ref.extension)) return notFound();

    const extension = translatedExtension(ref.extension);
    const target = targetBlobName(ref.guid, extension);
    if (!(await azure.blobs.getBlob(target))) return notFound();

    const expiresOn = new Date(clock.now().getTime() + DOWNLOAD_SAS_MINUTES * 60_000);
    const url = await azure.blobs.createReadUrl(target, expiresOn);
    const response: TranslatedFileResponse = { url, expiresOn: expiresOn.toISOString(), extension };
    return { status: 200, jsonBody: response };
  };
