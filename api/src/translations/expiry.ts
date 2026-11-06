import type { TranslationStatusResponse } from '@lingo-lens/shared';
import { AzureServiceError, type BatchJobStatus, type BlobPort } from '../azure/port';
import { blobPrefixes } from './blobNames';

/** What the SPA sees for a Translation whose files the sweep (or a DELETE) removed. */
export const EXPIRED: TranslationStatusResponse = { status: 'failed', category: 'expired' };

/** True when no blob of this Translation is left in `source/` or `target/`. Works for Documents and Images. */
export async function blobsGone(blobs: BlobPort, translationGuid: string): Promise<boolean> {
  const listings = await Promise.all(blobPrefixes(translationGuid).map((prefix) => blobs.listBlobs(prefix)));
  return listings.every((listing) => listing.length === 0);
}

/**
 * With the blobs gone, any job state means Expired except a genuine failure:
 * the failure is still the better answer for Failed/ValidationFailed.
 */
export const expiresWhenBlobsGone = (status: BatchJobStatus) => status !== 'Failed' && status !== 'ValidationFailed';

/** Translator (or Document Intelligence) no longer knows the operation: its history is gone too. */
export const isUnknownOperation = (error: unknown) => error instanceof AzureServiceError && error.httpStatus === 404;
