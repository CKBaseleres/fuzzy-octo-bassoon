import type { CreateUploadResponse, StartTranslationResponse } from '@lingo-lens/shared';
import type { ReadResult } from '../azure/port';
import { createUploadHandler } from '../functions/createUpload';
import { createStartTranslationHandler } from '../functions/startTranslation';
import type { FakeReadOperation } from './fakeAzureServices';
import type { TestApi } from './testApi';

export interface StartedImageTranslation {
  /** The opaque Translation id the SPA holds. */
  id: string;
  /** Our GUID (the upload id). */
  guid: string;
  sourceBlobName: string;
  /** Document Intelligence's analyze result id. */
  operationId: string;
  /** The fake analyze operation; set `read.status` (and `read.error`) to move it on. */
  read: FakeReadOperation;
  /** Simulates `prebuilt-read` finishing with this result. */
  succeed(result: ReadResult): void;
}

/**
 * Drives the public API the way the SPA does for an Image: get an upload SAS,
 * "PUT" the Image, start the Translation.
 */
export async function startImageTranslation(
  api: TestApi,
  { extension = 'jpg', targetLanguage = 'fr', sizeInBytes = 300_000 } = {},
): Promise<StartedImageTranslation> {
  const upload = await api.call(createUploadHandler, {
    method: 'POST',
    path: '/api/translations/uploads',
    body: { extension },
  });
  const { uploadId, uploadUrl } = upload.json<CreateUploadResponse>();
  const sourceBlobName = new URL(uploadUrl).pathname.slice(1);
  api.azure.state.putBlob(sourceBlobName, sizeInBytes);

  const started = await api.call(createStartTranslationHandler, {
    method: 'POST',
    path: '/api/translations',
    body: { uploadId, extension, targetLanguage },
  });
  if (started.status !== 202) throw new Error(`start responded ${started.status}`);
  const { id } = started.json<StartTranslationResponse>();
  const [operationId, read] = [...api.azure.state.readOperations.entries()].at(-1)!;

  return {
    id,
    guid: uploadId,
    sourceBlobName,
    operationId,
    read,
    succeed(result) {
      read.status = 'succeeded';
      read.result = result;
    },
  };
}
