import { randomUUID } from 'node:crypto';
import { isDocumentExtension, isImageExtension, type CreateUploadResponse } from '@lingo-lens/shared';
import type { HttpHandlerFactory } from '../deps';
import { sourceBlobName } from '../translations/blobNames';
import { badRequest, normaliseExtension, readJsonObject } from '../translations/http';
import { logEvent } from '../translations/log';

export const UPLOAD_SAS_MINUTES = 10;

/**
 * POST /api/translations/uploads: a GUID plus a write-only SAS for one blob.
 * Ticket 08 adds the kill switch and quota checks here, before the SAS is issued.
 */
export const createUploadHandler: HttpHandlerFactory =
  ({ azure, clock }) =>
  async (request, context) => {
    const body = await readJsonObject(request);
    const extension = normaliseExtension(body?.extension);
    if (!extension || !(isDocumentExtension(extension) || isImageExtension(extension))) {
      return badRequest('Unsupported file extension');
    }

    const uploadId = randomUUID();
    const expiresOn = new Date(clock.now().getTime() + UPLOAD_SAS_MINUTES * 60_000);
    const uploadUrl = await azure.blobs.createUploadUrl(sourceBlobName(uploadId, extension), expiresOn);

    logEvent(context, 'upload.created', { translationGuid: uploadId, format: extension });
    const response: CreateUploadResponse = { uploadId, uploadUrl, expiresOn: expiresOn.toISOString() };
    return { status: 200, jsonBody: response };
  };
