import {
  isDocumentExtension,
  isImageExtension,
  translatedExtension,
  type StartTranslationResponse,
} from '@lingo-lens/shared';
import type { HttpHandlerFactory } from '../deps';
import { sourceBlobName, targetBlobName } from '../translations/blobNames';
import { GUID_PATTERN, badRequest, normaliseExtension, readJsonObject } from '../translations/http';
import { logEvent } from '../translations/log';
import { encodeTranslationId } from '../translations/translationId';

/** Translator language codes: `fr`, `zh-Hans`, `sr-Latn-ME`... */
const LANGUAGE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

/** Lifetime of the read-only SAS Document Intelligence fetches the Image through. */
export const READ_SAS_MINUTES = 5;

/**
 * POST /api/translations: starts the Translation of an uploaded Source file.
 *
 * Plug-in points for later tickets, in this order before `startBatch`:
 *   - 08: kill switch, quota counting, and the real-size check (delete if oversized)
 *   - 05 (done): the `isImageExtension(extension)` branch starts `prebuilt-read` instead
 *   - 09: submit errors (`AzureServiceError`) -> classified failure
 */
export const createStartTranslationHandler: HttpHandlerFactory =
  ({ azure, clock }) =>
  async (request, context) => {
    const body = await readJsonObject(request);
    const uploadId = body?.uploadId;
    const extension = normaliseExtension(body?.extension);
    const targetLanguage = body?.targetLanguage;
    if (typeof uploadId !== 'string' || !GUID_PATTERN.test(uploadId)) return badRequest('Invalid uploadId');
    if (typeof targetLanguage !== 'string' || !LANGUAGE_CODE.test(targetLanguage)) {
      return badRequest('Invalid targetLanguage');
    }
    if (!extension || !(isDocumentExtension(extension) || isImageExtension(extension))) {
      return badRequest('Unsupported file extension');
    }

    const source = sourceBlobName(uploadId, extension);
    const blob = await azure.blobs.getBlob(source);
    if (!blob) return badRequest('Source file not uploaded');

    const startedAt = clock.now();
    const logStarted = () =>
      logEvent(context, 'translation.started', {
        translationGuid: uploadId,
        format: extension,
        sizeInBytes: blob.sizeInBytes,
        targetLanguage,
      });

    if (isImageExtension(extension)) {
      // Document Intelligence reads the Image itself, through a short-lived read-only SAS.
      const sourceUrl = await azure.blobs.createReadUrl(source, new Date(startedAt.getTime() + READ_SAS_MINUTES * 60_000));
      const { operationId } = await azure.documentIntelligence.startRead({ sourceUrl });
      logStarted();
      const id = encodeTranslationId({ kind: 'image', guid: uploadId, extension, operationId, startedAt, targetLanguage });
      const response: StartTranslationResponse = { id };
      return { status: 202, jsonBody: response };
    }

    const { operationId } = await azure.documentTranslation.startBatch({
      sourceBlobName: source,
      targetBlobName: targetBlobName(uploadId, translatedExtension(extension)),
      targetLanguage,
    });

    logStarted();
    const id = encodeTranslationId({ kind: 'document', guid: uploadId, extension, operationId, startedAt });
    const response: StartTranslationResponse = { id };
    return { status: 202, jsonBody: response };
  };
