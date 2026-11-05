import type { CreateUploadResponse, StartTranslationResponse } from '@lingo-lens/shared';
import { createUploadHandler } from '../functions/createUpload';
import { createStartTranslationHandler } from '../functions/startTranslation';
import type { FakeBatchJob } from './fakeAzureServices';
import type { TestApi } from './testApi';

export interface StartedDocumentTranslation {
  /** The opaque Translation id the SPA holds. */
  id: string;
  /** Our GUID (the upload id). */
  guid: string;
  sourceBlobName: string;
  targetBlobName: string;
  /** The fake batch job; set `job.status` (and `job.document`) to move it on. */
  job: FakeBatchJob;
  /** Simulates Translator finishing: status Succeeded and the Translated file written. */
  succeed(sizeInBytes?: number): void;
}

/**
 * Drives the public API the way the SPA does: get an upload SAS, "PUT" the
 * Source file, start the Translation. Use it to arrange polls, file and DELETE tests.
 */
export async function startDocumentTranslation(
  api: TestApi,
  { extension = 'pdf', targetLanguage = 'fr', sizeInBytes = 1000 } = {},
): Promise<StartedDocumentTranslation> {
  const upload = await api.call(createUploadHandler, {
    method: 'POST',
    path: '/api/translations/uploads',
    body: { extension },
  });
  const { uploadId, uploadUrl } = upload.json<CreateUploadResponse>();
  api.azure.state.putBlob(new URL(uploadUrl).pathname.slice(1), sizeInBytes);

  const started = await api.call(createStartTranslationHandler, {
    method: 'POST',
    path: '/api/translations',
    body: { uploadId, extension, targetLanguage },
  });
  if (started.status !== 202) throw new Error(`start responded ${started.status}`);
  const { id } = started.json<StartTranslationResponse>();
  const job = [...api.azure.state.batchJobs.values()].at(-1)!;

  return {
    id,
    guid: uploadId,
    sourceBlobName: job.request.sourceBlobName,
    targetBlobName: job.request.targetBlobName,
    job,
    succeed(size = 2000) {
      job.status = 'Succeeded';
      job.document = { status: 'Succeeded', characterCharged: 1234 };
      api.azure.state.putBlob(job.request.targetBlobName, size);
    },
  };
}
