import type { InvocationContext } from '@azure/functions';
import type { TranslationStatusResponse } from '@lingo-lens/shared';
import { AzureServiceError } from '../azure/port';
import type { Deps } from '../deps';
import { sourceBlobName } from './blobNames';
import { EXPIRED, isUnknownOperation } from './expiry';
import { isReadTerminal, mapReadStatus, mostCommonLanguage, translateParagraphs } from './imageStatus';
import { logEvent } from './log';
import type { TranslationRef } from './translationId';

/**
 * One poll of an Image Translation (spec: "API contract").
 *
 * The first poll that sees OCR `succeeded` translates the paragraphs, then
 * deletes the Image blob and calls Delete Analyze Result, and returns the whole
 * result: after it, Azure keeps nothing, so the SPA must stop polling on ready.
 * If Translator fails, nothing is deleted and the next poll tries again.
 *
 * Plug-in points: ticket 10 maps a failed read (and zero paragraphs, as
 * `noTextFound`) through the classifier; 09 adds the timeout from `ref.startedAt`.
 * A vanished analyze result (404) is Expired (ticket 07's rule).
 */
export async function pollImageTranslation(
  { azure, clock }: Deps,
  ref: TranslationRef & { targetLanguage: string },
  context: InvocationContext,
): Promise<TranslationStatusResponse> {
  let read;
  try {
    read = await azure.documentIntelligence.getReadResult(ref.operationId);
  } catch (error) {
    // Deleted after the ready poll (or purged by Azure after 24 h): nothing is left to show.
    if (isUnknownOperation(error)) return EXPIRED;
    throw error;
  }
  if (!isReadTerminal(read.status)) return mapReadStatus(read);

  let response: TranslationStatusResponse;
  let detectedLanguage: string | undefined;
  if (read.status === 'succeeded' && read.result) {
    const paragraphs = await translateParagraphs(azure, read.result, ref.targetLanguage);
    detectedLanguage = mostCommonLanguage(paragraphs);
    response = {
      status: 'ready',
      kind: 'image',
      page: { width: read.result.page.width, height: read.result.page.height },
      paragraphs,
      ...(detectedLanguage ? { detectedLanguage } : {}),
      isHandwritten: read.result.isHandwritten,
    };
  } else {
    response = mapReadStatus(read);
  }

  await azure.blobs.deleteBlob(sourceBlobName(ref.guid, ref.extension));
  try {
    await azure.documentIntelligence.deleteReadResult(ref.operationId);
  } catch (error) {
    // Already gone (or never kept, for a failed read): Document Intelligence purges it within 24 h anyway.
    if (!(error instanceof AzureServiceError)) throw error;
  }
  logEvent(context, 'translation.jobEnded', {
    translationGuid: ref.guid,
    format: ref.extension,
    jobStatus: read.status,
    ...(detectedLanguage ? { detectedLanguage } : {}),
    durationMs: clock.now().getTime() - ref.startedAt.getTime(),
  });
  return response;
}
