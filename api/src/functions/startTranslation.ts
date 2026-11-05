import {
  isDocumentExtension,
  isImageExtension,
  translatedExtension,
  type StartTranslationResponse,
} from '@lingo-lens/shared';
import type { HttpHandlerFactory } from '../deps';
import { sourceBlobName, targetBlobName } from '../translations/blobNames';
import { GUID_PATTERN, badRequest, normaliseExtension, readJsonObject } from '../translations/http';
import { admitTranslation } from '../guardrails/admitTranslation';
import { logEvent } from '../translations/log';
import { encodeTranslationId } from '../translations/translationId';

/** Translator language codes: `fr`, `zh-Hans`, `sr-Latn-ME`... */
const LANGUAGE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

/**
 * POST /api/translations: starts the Translation of an uploaded Source file.
 *
 * `admitTranslation` (ticket 08) applies the size check, kill switch and quotas
 * to Documents and Images alike, and counts the Translation.
 *
 * Plug-in points for later tickets, after `admitTranslation` and before `startBatch`:
 *   - 05: `isImageExtension(extension)` branch that starts `prebuilt-read` instead
 *     (replacing the "not yet" 400 below)
 *   - 09: submit errors (`AzureServiceError`) -> classified failure
 */
export const createStartTranslationHandler: HttpHandlerFactory =
  (deps) =>
  async (request, context) => {
    const { azure, clock } = deps;
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

    const refusal = await admitTranslation(deps, request, blob, extension);
    if (refusal) return refusal;
    if (!isDocumentExtension(extension)) return badRequest('Image Translation is not available yet');

    const startedAt = clock.now();
    const { operationId } = await azure.documentTranslation.startBatch({
      sourceBlobName: source,
      targetBlobName: targetBlobName(uploadId, translatedExtension(extension)),
      targetLanguage,
    });

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
