import type { TokenCredential } from '@azure/identity';
import type { AzureServiceName, DocumentIntelligencePort, ReadParagraph, ReadStatus, TextTranslationPort } from './port';
import { endpointUrl } from './endpoint';
import { failure, toErrorBody, type RawError } from './translatorAdapter';

/** Document Intelligence v4.0 GA (spec: "Translation pipelines"). */
export const DOCUMENT_INTELLIGENCE_API_VERSION = '2024-11-30';
const READ_MODEL = 'prebuilt-read';
const COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';

/** `fetch` with a managed-identity bearer token; a non-2xx answer becomes an `AzureServiceError`. */
function bearerFetch(service: AzureServiceName, credential: TokenCredential) {
  return async (method: string, target: URL, body?: unknown): Promise<Response> => {
    const token = await credential.getToken(COGNITIVE_SERVICES_SCOPE);
    if (!token) throw new Error('No token for Cognitive Services');
    const response = await fetch(target, {
      method,
      headers: {
        authorization: `Bearer ${token.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw await failure(service, response);
    return response;
  };
}

interface RawAnalyzeResult {
  status: ReadStatus;
  error?: RawError;
  analyzeResult?: {
    pages?: { pageNumber: number; width: number; height: number }[];
    paragraphs?: { content: string; boundingRegions?: { pageNumber: number; polygon: number[] }[] }[];
    styles?: { isHandwritten?: boolean }[];
  };
}

/**
 * Document Intelligence `prebuilt-read` over REST, keyless (Cognitive Services
 * User on the resource). Document Intelligence fetches the Image itself from a
 * read-only SAS URL. Only the first page is analysed (`pages=1`): an Image is
 * one page, and a multi-page TIFF shows its first page only.
 */
export function createDocumentIntelligenceAdapter(options: {
  /** `DOCUMENT_INTELLIGENCE_ENDPOINT`, the custom-domain endpoint. */
  endpoint: string;
  credential: TokenCredential;
}): DocumentIntelligencePort {
  const call = bearerFetch('documentIntelligence', options.credential);
  const url = (path: string, query: Record<string, string> = {}) => {
    const u = new URL(
      `documentintelligence/documentModels/${path}`,
      endpointUrl('DOCUMENT_INTELLIGENCE_ENDPOINT', options.endpoint),
    );
    u.searchParams.set('api-version', DOCUMENT_INTELLIGENCE_API_VERSION);
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
    return u;
  };
  const resultUrl = (operationId: string) => url(`${READ_MODEL}/analyzeResults/${encodeURIComponent(operationId)}`);

  return {
    async startRead({ sourceUrl }) {
      const response = await call('POST', url(`${READ_MODEL}:analyze`, { pages: '1' }), { urlSource: sourceUrl });
      const location = response.headers.get('operation-location');
      const operationId = location ? new URL(location).pathname.split('/').at(-1) : undefined;
      if (!operationId) throw new Error('Analyze returned no operation-location');
      return { operationId };
    },

    async getReadResult(operationId) {
      const raw = (await (await call('GET', resultUrl(operationId))).json()) as RawAnalyzeResult;
      const error = toErrorBody(raw.error);
      const analyzed = raw.analyzeResult;
      const page = analyzed?.pages?.find((p) => p.pageNumber === 1) ?? analyzed?.pages?.[0];
      if (raw.status !== 'succeeded' || !analyzed || !page) {
        return { status: raw.status, ...(error ? { error } : {}) };
      }
      const paragraphs: ReadParagraph[] = (analyzed.paragraphs ?? []).flatMap((p) => {
        const region = p.boundingRegions?.find((r) => r.pageNumber === page.pageNumber);
        return region ? [{ content: p.content, polygon: region.polygon }] : [];
      });
      return {
        status: raw.status,
        result: {
          page: { width: page.width, height: page.height },
          paragraphs,
          isHandwritten: (analyzed.styles ?? []).some((s) => s.isHandwritten === true),
        },
      };
    },

    async deleteReadResult(operationId) {
      await call('DELETE', resultUrl(operationId));
    },
  };
}

/**
 * Translator text v3 `translate` (NMT, no `from`, so the source is
 * auto-detected) on the custom-domain endpoint with a bearer token. The caller
 * keeps each request within the limits (see `translations/imageStatus.ts`).
 */
export function createTextTranslateAdapter(options: {
  /** `TRANSLATOR_ENDPOINT`, the custom-domain endpoint. */
  translatorEndpoint: string;
  credential: TokenCredential;
}): TextTranslationPort['translate'] {
  const call = bearerFetch('textTranslation', options.credential);
  return async ({ texts, targetLanguage }) => {
    const u = new URL(
      'translator/text/v3.0/translate',
      endpointUrl('TRANSLATOR_ENDPOINT', options.translatorEndpoint),
    );
    u.searchParams.set('api-version', '3.0');
    u.searchParams.set('to', targetLanguage);
    const results = (await (await call('POST', u, texts.map((text) => ({ text })))).json()) as {
      detectedLanguage?: { language: string };
      translations: { text: string }[];
    }[];
    return results.map((r) => ({
      text: r.translations[0]?.text ?? '',
      ...(r.detectedLanguage ? { detectedLanguage: r.detectedLanguage.language } : {}),
    }));
  };
}
