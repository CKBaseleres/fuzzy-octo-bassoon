import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import type { BlobInfo } from '../azure/port';
import type { Deps } from '../deps';
import { countTranslation, refuseIfOverLimit } from './limits';
import { refuseIfTooLarge } from './sourceSize';

/**
 * Every guardrail `POST /api/translations` applies to an uploaded Source file
 * (Document or Image) before it starts anything in Azure, in order:
 *   1. the real size (413, blob deleted, not counted)
 *   2. the kill switch and both quotas (429 + Retry-After, blob deleted, not counted)
 *   3. counting it: from here on it counts, whatever happens next.
 * Returns the refusal to send, or undefined when the Translation may start.
 */
export async function admitTranslation(
  deps: Deps,
  request: HttpRequest,
  source: BlobInfo,
  extension: string,
): Promise<HttpResponseInit | undefined> {
  const tooLarge = await refuseIfTooLarge(deps, source, extension);
  if (tooLarge) return tooLarge;

  const refusal = await refuseIfOverLimit(deps, request);
  if (refusal) {
    // It can never be translated now; don't keep it until the sweep.
    await deps.azure.blobs.deleteBlob(source.name);
    return refusal;
  }

  await countTranslation(deps, request);
  return undefined;
}
