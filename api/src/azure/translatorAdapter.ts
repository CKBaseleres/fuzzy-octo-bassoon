import type { TokenCredential } from '@azure/identity';
import { endpointUrl } from './endpoint';
import {
  AzureServiceError,
  type AzureErrorBody,
  type AzureServiceName,
  type BatchDocumentStatus,
  type BatchJobStatus,
  type DocumentTranslationPort,
  type TargetLanguage,
} from './port';

/** Document Translation GA API (spec: "Translation pipelines"). */
export const DOCUMENT_TRANSLATION_API_VERSION = '2026-03-01';
const COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';
/** The public, unauthenticated Translator languages list. */
const LANGUAGES_URL = 'https://api.cognitive.microsofttranslator.com/languages?api-version=3.0&scope=translation';
const LANGUAGES_CACHE_MS = 24 * 60 * 60_000;

export interface RawError {
  /** Translator text v3 sends a number (e.g. `400050`); the other services send a string. */
  code?: string | number;
  message?: string;
  innerError?: { code?: string; message?: string };
  /** Document Intelligence spells it in lower case. */
  innererror?: { code?: string; message?: string };
}

export function toErrorBody(raw: RawError | undefined): AzureErrorBody | undefined {
  if (raw?.code === undefined || raw.code === '') return undefined;
  const innerCode = (raw.innerError ?? raw.innererror)?.code;
  return {
    code: String(raw.code),
    ...(raw.message ? { message: raw.message.slice(0, 300) } : {}),
    ...(innerCode ? { innerErrorCode: innerCode } : {}),
  };
}

/** Azure's request id, for error logs. */
export const requestIdOf = (response: Response) =>
  response.headers.get('apim-request-id') ?? response.headers.get('x-requestid') ?? undefined;

export async function failure(service: AzureServiceName, response: Response): Promise<AzureServiceError> {  let raw: RawError | undefined;
  try {
    raw = ((await response.json()) as { error?: RawError }).error;
  } catch {
    raw = undefined;
  }
  return new AzureServiceError({
    service,
    httpStatus: response.status,
    requestId: requestIdOf(response),
    ...toErrorBody(raw),
  });
}

/** No response at all (DNS, connection reset...): status 0, which the retry wrapper retries. */
async function send(service: AzureServiceName, target: URL | string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(target, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AzureServiceError({ service, httpStatus: 0, code: 'NetworkError', message: message.slice(0, 300) });
  }
}

/**
 * Translator batch Document Translation over REST with a managed-identity bearer
 * token (Cognitive Services User on the Translator). Thin on purpose: the REST
 * client package does not track the 2026-03-01 API, so we call it directly.
 * Containers are reached with plain URLs: Translator's own identity has
 * Storage Blob Data Contributor, so no SAS is involved.
 */
export function createDocumentTranslationAdapter(options: {
  /** Custom-domain endpoint, e.g. `https://trl-x.cognitiveservices.azure.com/`. */
  translatorEndpoint: string;
  /** Blob endpoint, e.g. `https://stx.blob.core.windows.net/`. */
  blobEndpoint: string;
  credential: TokenCredential;
}): DocumentTranslationPort {
  // Built per call, so a missing setting fails the request, not the module load.
  const blobUrl = (blobName: string) =>
    new URL(blobName, endpointUrl('STORAGE_BLOB_ENDPOINT', options.blobEndpoint)).toString();
  const url = (path: string) => {
    const u = new URL(`translator/document/${path}`, endpointUrl('TRANSLATOR_ENDPOINT', options.translatorEndpoint));
    u.searchParams.set('api-version', DOCUMENT_TRANSLATION_API_VERSION);
    return u;
  };

  async function call(method: string, target: URL, body?: unknown): Promise<Response> {
    const token = await options.credential.getToken(COGNITIVE_SERVICES_SCOPE);
    if (!token) throw new Error('No token for Cognitive Services');
    const response = await send('documentTranslation', target, {
      method,
      headers: {
        authorization: `Bearer ${token.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw await failure('documentTranslation', response);
    return response;
  }

  return {
    async startBatch({ sourceBlobName, targetBlobName, targetLanguage }) {
      const response = await call('POST', url('batches'), {
        inputs: [
          {
            storageType: 'File',
            source: { sourceUrl: blobUrl(sourceBlobName) },
            targets: [{ targetUrl: blobUrl(targetBlobName), language: targetLanguage }],
            // Standard NMT (no deploymentName), and no translating of text inside embedded images.
            translateTextWithinImage: false,
          },
        ],
      });
      const location = response.headers.get('operation-location');
      const operationId = location ? new URL(location).pathname.split('/').at(-1) : undefined;
      if (!operationId) throw new Error('Batch submit returned no operation-location');
      return { operationId };
    },

    async getBatchStatus(operationId) {
      const jobResponse = await call('GET', url(`batches/${encodeURIComponent(operationId)}`));
      const requestId = requestIdOf(jobResponse);
      const job = (await jobResponse.json()) as {
        status: BatchJobStatus;
        error?: RawError;
      };
      let document: BatchDocumentStatus | undefined;
      if (job.status !== 'NotStarted') {
        const docs = (await (
          await call('GET', url(`batches/${encodeURIComponent(operationId)}/documents?$top=1`))
        ).json()) as { value?: { status: BatchJobStatus; characterCharged?: number; error?: RawError }[] };
        const first = docs.value?.[0];
        if (first) {
          const error = toErrorBody(first.error);
          document = {
            status: first.status,
            ...(first.characterCharged === undefined ? {} : { characterCharged: first.characterCharged }),
            ...(error ? { error } : {}),
          };
        }
      }
      const error = toErrorBody(job.error);
      return {
        status: job.status,
        ...(error ? { error } : {}),
        ...(document ? { document } : {}),
        ...(requestId ? { requestId } : {}),
      };
    },

    async cancelBatch(operationId) {
      await call('DELETE', url(`batches/${encodeURIComponent(operationId)}`));
    },

    async listActiveBatches(createdBefore) {
      // Get Translations Status, filtered server side and checked again here (ticket 01
      // must confirm the `statuses` format on the 2026-03-01 API). Follows `@nextLink`.
      const first = url('batches');
      first.searchParams.set('statuses', 'NotStarted,Running');
      first.searchParams.set('createdDateTimeUtcEnd', createdBefore.toISOString());
      const ids: string[] = [];
      let next: URL | undefined = first;
      while (next) {
        const page = (await (await call('GET', next)).json()) as {
          value?: { id: string; status: BatchJobStatus; createdDateTimeUtc: string }[];
          '@nextLink'?: string | null;
        };
        for (const job of page.value ?? []) {
          const active = job.status === 'NotStarted' || job.status === 'Running';
          if (active && new Date(job.createdDateTimeUtc) < createdBefore) ids.push(job.id);
        }
        next = page['@nextLink'] ? new URL(page['@nextLink']) : undefined;
      }
      return ids;
    },
  };
}

/** Translator's target languages (public endpoint, no credential), cached for a day. */
export function createLanguagesSource(): () => Promise<TargetLanguage[]> {
  let cached: { at: number; languages: TargetLanguage[] } | undefined;
  return async () => {
    if (cached && Date.now() - cached.at < LANGUAGES_CACHE_MS) return cached.languages;
    const response = await send('textTranslation', LANGUAGES_URL, { headers: { 'accept-language': 'en' } });
    if (!response.ok) throw await failure('textTranslation', response);
    const body = (await response.json()) as { translation?: Record<string, { name: string }> };
    const languages = Object.entries(body.translation ?? {}).map(([code, { name }]) => ({ code, name }));
    cached = { at: Date.now(), languages };
    return languages;
  };
}
