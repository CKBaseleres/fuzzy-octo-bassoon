import type { TokenCredential } from '@azure/identity';
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

interface RawError {
  code?: string;
  message?: string;
  innerError?: { code?: string; message?: string };
}

const toErrorBody = (raw: RawError | undefined): AzureErrorBody | undefined =>
  raw?.code
    ? {
        code: raw.code,
        ...(raw.message ? { message: raw.message.slice(0, 300) } : {}),
        ...(raw.innerError?.code ? { innerErrorCode: raw.innerError.code } : {}),
      }
    : undefined;

async function failure(service: AzureServiceName, response: Response): Promise<AzureServiceError> {
  let raw: RawError | undefined;
  try {
    raw = ((await response.json()) as { error?: RawError }).error;
  } catch {
    raw = undefined;
  }
  return new AzureServiceError({ service, httpStatus: response.status, ...toErrorBody(raw) });
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
  const base = new URL('translator/document/', options.translatorEndpoint);
  const blobUrl = (blobName: string) => new URL(blobName, options.blobEndpoint).toString();
  const url = (path: string) => {
    const u = new URL(path, base);
    u.searchParams.set('api-version', DOCUMENT_TRANSLATION_API_VERSION);
    return u;
  };

  async function call(method: string, target: URL, body?: unknown): Promise<Response> {
    const token = await options.credential.getToken(COGNITIVE_SERVICES_SCOPE);
    if (!token) throw new Error('No token for Cognitive Services');
    const response = await fetch(target, {
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
      const job = (await (await call('GET', url(`batches/${encodeURIComponent(operationId)}`))).json()) as {
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
      return { status: job.status, ...(error ? { error } : {}), ...(document ? { document } : {}) };
    },

    async cancelBatch(operationId) {
      await call('DELETE', url(`batches/${encodeURIComponent(operationId)}`));
    },
  };
}

/** Translator's target languages (public endpoint, no credential), cached for a day. */
export function createLanguagesSource(): () => Promise<TargetLanguage[]> {
  let cached: { at: number; languages: TargetLanguage[] } | undefined;
  return async () => {
    if (cached && Date.now() - cached.at < LANGUAGES_CACHE_MS) return cached.languages;
    const response = await fetch(LANGUAGES_URL, { headers: { 'accept-language': 'en' } });
    if (!response.ok) throw await failure('textTranslation', response);
    const body = (await response.json()) as { translation?: Record<string, { name: string }> };
    const languages = Object.entries(body.translation ?? {}).map(([code, { name }]) => ({ code, name }));
    cached = { at: Date.now(), languages };
    return languages;
  };
}
