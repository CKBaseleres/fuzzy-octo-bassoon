import type { HttpResponseInit } from '@azure/functions';
import { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, isImageExtension, type TooLargeResponse } from '@lingo-lens/shared';
import type { BlobInfo } from '../azure/port';
import type { Deps } from '../deps';

/** The size limit for a Source file with this (Document or Image) extension. */
export const maxSourceBytes = (extension: string) => (isImageExtension(extension) ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES);

/**
 * A SAS cannot cap the upload size, so the real blob size is checked before a
 * Translation starts. An oversized Source file is deleted at once and answered
 * with 413; undefined means it is within its limit.
 */
export async function refuseIfTooLarge(
  { azure }: Pick<Deps, 'azure'>,
  blob: BlobInfo,
  extension: string,
): Promise<HttpResponseInit | undefined> {
  const maxBytes = maxSourceBytes(extension);
  if (blob.sizeInBytes <= maxBytes) return undefined;
  await azure.blobs.deleteBlob(blob.name);
  return { status: 413, jsonBody: { error: 'tooLarge', maxBytes } satisfies TooLargeResponse };
}
