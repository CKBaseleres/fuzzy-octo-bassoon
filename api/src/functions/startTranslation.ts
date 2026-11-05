import { isDocumentExtension, translatedExtension, type StartTranslationResponse } from '@lingo-lens/shared';
import type { HttpResponseInit } from '@azure/functions';
import { AzureServiceError } from '../azure/port';
import type { HttpHandlerFactory } from '../deps';
import { classify, requestFailureInput } from '../translations/classifier';
import { failedResponse } from '../translations/documentStatus';
import { sourceBlobName, targetBlobName } from '../translations/blobNames';
import { GUID_PATTERN, badRequest, normaliseExtension, readJsonObject } from '../translations/http';
import { logEvent, logFailure, type TranslationLogFields } from '../translations/log';
import { encodeTranslationId } from '../translations/translationId';

/** Translator language codes: `fr`, `zh-Hans`, `sr-Latn-ME`... */
const LANGUAGE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

/**
 * POST /api/translations: starts the Translation of an uploaded Source file.
 *
 * Plug-in points for later tickets, in this order before `startBatch`:
 *   - 08: kill switch, quota counting, and the real-size check (delete if oversized)
 *   - 05: `isImageExtension(extension)` branch that starts `prebuilt-read` instead
 *   - 09 (done): submit errors (`AzureServiceError`) -> classified failure, 502
 */
export const createStartTranslationHandler: HttpHandlerFactory =
  ({ azure, clock }) =>
  async (request, context) => {
    /** Azure refused the submit (after retries): classify, log, delete the Source file, answer 502. */
    const submitFailed = async (
      error: AzureServiceError,
      source: string,
      logBase: TranslationLogFields,
    ): Promise<HttpResponseInit> => {
      const input = requestFailureInput(error, 'startBatch');
      const classification = classify(input);
      logFailure(context, logBase, input, classification, error);
      await azure.blobs.deleteBlob(source).catch(() => undefined);
      return { status: 502, jsonBody: failedResponse(classification) };
    };

    const body = await readJsonObject(request);
    const uploadId = body?.uploadId;
    const extension = normaliseExtension(body?.extension);
    const targetLanguage = body?.targetLanguage;
    if (typeof uploadId !== 'string' || !GUID_PATTERN.test(uploadId)) return badRequest('Invalid uploadId');
    if (typeof targetLanguage !== 'string' || !LANGUAGE_CODE.test(targetLanguage)) {
      return badRequest('Invalid targetLanguage');
    }
    if (!extension || !isDocumentExtension(extension)) return badRequest('Unsupported file extension');

    const source = sourceBlobName(uploadId, extension);
    const blob = await azure.blobs.getBlob(source);
    if (!blob) return badRequest('Source file not uploaded');

    const startedAt = clock.now();
    let operationId: string;
    try {
      ({ operationId } = await azure.documentTranslation.startBatch({
        sourceBlobName: source,
        targetBlobName: targetBlobName(uploadId, translatedExtension(extension)),
        targetLanguage,
      }));
    } catch (error) {
      if (!(error instanceof AzureServiceError)) throw error;
      return submitFailed(error, source, { translationGuid: uploadId, format: extension, sizeInBytes: blob.sizeInBytes, targetLanguage });
    }

    logEvent(context, 'translation.started', {
      translationGuid: uploadId,
      format: extension,
      sizeInBytes: blob.sizeInBytes,
      targetLanguage,
    });
    const id = encodeTranslationId({ kind: 'document', guid: uploadId, extension, operationId, startedAt });
    const response: StartTranslationResponse = { id };
    return { status: 202, jsonBody: response };
  };
