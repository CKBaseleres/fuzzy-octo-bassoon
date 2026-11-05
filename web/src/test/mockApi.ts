import type {
  CreateUploadResponse,
  HealthResponse,
  LanguagesResponse,
  StartTranslationResponse,
  TranslatedFileResponse,
  TranslationStatusResponse,
} from '@lingo-lens/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Seam 2 harness: the network boundary of the SPA. Started in `setup.ts` with
 * no handlers, so every test arranges exactly the `/api` responses it needs
 * through `mockApi`, typed by the `shared` contract.
 *
 * Growing it: add one helper per endpoint here, typed with its `shared`
 * response type. Tests that need to inspect requests use `recordRequests()`.
 */
export const server = setupServer();

/** Where the fake SAS URLs point. Blob Storage is faked at the network boundary too. */
export const FAKE_BLOB_ORIGIN = 'https://fake.blob.core.windows.net';

export interface RecordedRequest {
  method: string;
  /** Path (and query) for same-origin `/api` calls; the full URL for Blob Storage. */
  url: string;
  headers: Headers;
  /** The request body as text (JSON bodies are serialised JSON). */
  body: string;
}

export const mockApi = {
  health(body: HealthResponse, init?: ResponseInit) {
    server.use(http.get<never, never, HealthResponse>('/api/health', () => HttpResponse.json(body, init)));
  },
  healthFails(status: number) {
    server.use(http.get('/api/health', () => new HttpResponse(null, { status })));
  },

  languages(languages: LanguagesResponse['languages']) {
    server.use(http.get<never, never, LanguagesResponse>('/api/languages', () => HttpResponse.json({ languages })));
  },

  /** `POST /api/translations/uploads`. Defaults to a SAS on the fake blob origin. */
  createUpload(body: Partial<CreateUploadResponse> = {}) {
    const uploadId = body.uploadId ?? '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
    server.use(
      http.post<never, never, CreateUploadResponse>('/api/translations/uploads', () =>
        HttpResponse.json({
          uploadId,
          uploadUrl: `${FAKE_BLOB_ORIGIN}/source/${uploadId}/file.bin?sp=cw&sig=fake`,
          expiresOn: '2030-01-01T00:00:00.000Z',
          ...body,
        }),
      ),
    );
  },

  /** The browser's direct `PUT` of the Source file to Blob Storage. */
  blobUpload(status = 201) {
    server.use(http.put(`${FAKE_BLOB_ORIGIN}/*`, () => new HttpResponse(null, { status })));
  },

  startTranslation(body: StartTranslationResponse = { id: 'translation-1' }) {
    server.use(
      http.post<never, never, StartTranslationResponse>('/api/translations', () => HttpResponse.json(body, { status: 202 })),
    );
  },

  /** Each poll gets the next status; the last one repeats. */
  translationStatus(...statuses: TranslationStatusResponse[]) {
    let i = 0;
    server.use(
      http.get<{ id: string }, never, TranslationStatusResponse>('/api/translations/:id', () =>
        HttpResponse.json(statuses[Math.min(i++, statuses.length - 1)]),
      ),
    );
  },

  translatedFile(body: Partial<TranslatedFileResponse> = {}) {
    server.use(
      http.get<{ id: string }, never, TranslatedFileResponse>('/api/translations/:id/file', () =>
        HttpResponse.json({
          url: `${FAKE_BLOB_ORIGIN}/target/guid/file.pdf?sp=r&sig=fake`,
          expiresOn: '2030-01-01T00:00:00.000Z',
          extension: 'pdf',
          ...body,
        }),
      ),
    );
  },

  /** The browser's direct `GET` of the Translated file from Blob Storage. */
  blobDownload(content = 'translated bytes') {
    server.use(http.get(`${FAKE_BLOB_ORIGIN}/*`, () => new HttpResponse(content, { status: 200 })));
  },

  deleteTranslation() {
    server.use(http.delete('/api/translations/:id', () => new HttpResponse(null, { status: 204 })));
  },

  /** Every request the SPA makes from now on, in the order it made them. */
  recordRequests(): RecordedRequest[] {
    const recorded: RecordedRequest[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      const entry: RecordedRequest = {
        method: request.method,
        url: url.origin === FAKE_BLOB_ORIGIN ? request.url : `${url.pathname}${url.search}`,
        headers: request.headers,
        body: '',
      };
      recorded.push(entry);
      void request
        .clone()
        .text()
        .then((text) => (entry.body = text))
        .catch(() => undefined);
    });
    return recorded;
  },
};
