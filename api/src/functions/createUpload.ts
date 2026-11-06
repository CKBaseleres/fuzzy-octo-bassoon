import { randomUUID } from 'node:crypto';
import { isDocumentExtension, isImageExtension, type CreateUploadResponse } from '@lingo-lens/shared';
import type { HttpHandlerFactory } from '../deps';
import { sourceBlobName } from '../translations/blobNames';
import { badRequest, normaliseExtension, readJsonObject } from '../translations/http';
import { refuseIfOverLimit } from '../guardrails/limits';
import { logEvent } from '../translations/log';

export const UPLOAD_SAS_MINUTES = 10;

/**
 * POST /api/translations/uploads: a GUID plus a write-only SAS for one blob.
 * Refused (429) when the kill switch is off or a quota is used up, so nothing is
 * uploaded that could not be translated. Nothing is counted here.
 */
export const createUploadHandler: HttpHandlerFactory =
  (deps) =>
  async (request, context) => {
    const { azure, clock } = deps;
    const body = await readJsonObject(request);
    const extension = normaliseExtension(body?.extension);
    if (!extension || !(isDocumentExtension(extension) || isImageExtension(extension))) {
      return badRequest('Unsupported file extension');
    }

    const refusal = await refuseIfOverLimit(deps, request);
    if (refusal) return refusal;

    const translationGuid = randomUUID();
    const expiresOn = new Date(clock.now().getTime() + UPLOAD_SAS_MINUTES * 60_000);
    const uploadUrl = await azure.blobs.createUploadUrl(sourceBlobName(translationGuid, extension), expiresOn);

    logEvent(context, 'upload.created', { translationGuid, format: extension });
    const response: CreateUploadResponse = { translationGuid, uploadUrl, expiresOn: expiresOn.toISOString() };
    return { status: 200, jsonBody: response };
  };
