import {
  isDocumentExtension,
  isImageExtension,
  translatedExtension,
  type StartTranslationResponse,
} from '@lingo-lens/shared';
import type { HttpResponseInit } from '@azure/functions';
import { AzureServiceError } from '../azure/port';
import type { HttpHandlerFactory } from '../deps';
import { classify, requestFailureInput } from '../translations/classifier';
import { failedResponse } from '../translations/documentStatus';
import { sourceBlobName, targetBlobName } from '../translations/blobNames';
import { GUID_PATTERN, badRequest, normaliseExtension, readJsonObject } from '../translations/http';
import { admitTranslation } from '../guardrails/admitTranslation';
import { logEvent, logFailure, type TranslationLogFields } from '../translations/log';
import { encodeTranslationId } from '../translations/translationId';

/** Translator language codes: `fr`, `zh-Hans`, `sr-Latn-ME`... */
const LANGUAGE_CODE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

/** Lifetime of the read-only SAS Document Intelligence fetches the Image through. */
export const READ_SAS_MINUTES = 5;

/**
 * POST /api/translations: starts the Translation of an uploaded Source file.
 *
 * `admitTranslation` (ticket 08) applies the size check, kill switch and quotas
 * to Documents and Images alike, and counts the Translation. Images then start
 * `prebuilt-read` (ticket 05); Documents start a batch job.
 *
 * Azure refusing the submit (`startBatch` or `startRead`, an `AzureServiceError`
 * after retries) -> classified failure, 502, Source file deleted (tickets 09, 10).
 */
export const createStartTranslationHandler: HttpHandlerFactory =
  (deps) =>
  async (request, context) => {
    const { azure, clock } = deps;

    /** Azure refused the submit (after retries): classify, log, delete the Source file, answer 502. */
    const submitFailed = async (
      error: AzureServiceError,
      operation: string,
      source: string,
      logBase: TranslationLogFields,
    ): Promise<HttpResponseInit> => {
      const input = requestFailureInput(error, operation);
      const classification = classify(input);
      logFailure(context, logBase, input, classification, error);
      await azure.blobs.deleteBlob(source).catch(() => undefined);
      return { status: 502, jsonBody: failedResponse(classification) };
    };

    const body = await readJsonObject(request);
    const translationGuid = body?.translationGuid;
    const extension = normaliseExtension(body?.extension);
    const targetLanguage = body?.targetLanguage;
    if (typeof translationGuid !== 'string' || !GUID_PATTERN.test(translationGuid)) return badRequest('Invalid translationGuid');
    if (typeof targetLanguage !== 'string' || !LANGUAGE_CODE.test(targetLanguage)) {
      return badRequest('Invalid targetLanguage');
    }
    if (!extension || !(isDocumentExtension(extension) || isImageExtension(extension))) {
      return badRequest('Unsupported file extension');
    }

    const source = sourceBlobName(translationGuid, extension);
    const blob = await azure.blobs.getBlob(source);
    if (!blob) return badRequest('Source file not uploaded');

    const refusal = await admitTranslation(deps, request, blob, extension);
    if (refusal) return refusal;

    const startedAt = clock.now();
    const logBase: TranslationLogFields = {
      translationGuid,
      format: extension,
      sizeInBytes: blob.sizeInBytes,
      targetLanguage,
    };
    const logStarted = () => logEvent(context, 'translation.started', logBase);

    if (isImageExtension(extension)) {
      // Document Intelligence reads the Image itself, through a short-lived read-only SAS.
      const sourceUrl = await azure.blobs.createReadUrl(source, new Date(startedAt.getTime() + READ_SAS_MINUTES * 60_000));
      let operationId: string;
      try {
        ({ operationId } = await azure.documentIntelligence.startRead({ sourceUrl }));
      } catch (error) {
        if (!(error instanceof AzureServiceError)) throw error;
        return submitFailed(error, 'startRead', source, logBase);
      }
      logStarted();
      const id = encodeTranslationId({ kind: 'image', translationGuid, extension, operationId, startedAt, targetLanguage });
      const response: StartTranslationResponse = { id };
      return { status: 202, jsonBody: response };
    }

    let operationId: string;
    try {
      ({ operationId } = await azure.documentTranslation.startBatch({
        sourceBlobName: source,
        targetBlobName: targetBlobName(translationGuid, translatedExtension(extension)),
        targetLanguage,
      }));
    } catch (error) {
      if (!(error instanceof AzureServiceError)) throw error;
      return submitFailed(error, 'startBatch', source, logBase);
    }

    logStarted();
    const id = encodeTranslationId({ kind: 'document', translationGuid, extension, operationId, startedAt });
    const response: StartTranslationResponse = { id };
    return { status: 202, jsonBody: response };
  };
