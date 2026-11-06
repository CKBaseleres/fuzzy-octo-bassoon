import type {
  ApiErrorResponse,
  CreateUploadResponse,
  FailedTranslationResponse,
  HealthResponse,
  LanguagesResponse,
  QuotaLimit,
  RefusedResponse,
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

/** An answer that is an HTTP failure instead of a body, e.g. `{ httpStatus: 503 }`. */
export interface HttpFailure {
  httpStatus: number;
}

const isFailure = (answer: object): answer is HttpFailure => 'httpStatus' in answer;

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

  /**
   * `POST /api/translations/uploads`. Defaults to a SAS on the fake blob origin.
   * Pass several upload ids to hand out a new GUID per call (the last one repeats).
   */
  createUpload(body: Partial<CreateUploadResponse> = {}, ...moreUploadIds: string[]) {
    const ids = [body.translationGuid ?? '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b', ...moreUploadIds];
    let i = 0;
    server.use(
      http.post<never, never, CreateUploadResponse>('/api/translations/uploads', () => {
        const translationGuid = ids[Math.min(i++, ids.length - 1)]!;
        return HttpResponse.json({
          uploadUrl: `${FAKE_BLOB_ORIGIN}/source/${translationGuid}/file.bin?sp=cw&sig=fake`,
          expiresOn: '2030-01-01T00:00:00.000Z',
          ...body,
          translationGuid,
        });
      }),
    );
  },

  /** `POST /api/translations/uploads` refused by a quota or the kill switch (429 + `Retry-After` in seconds). */
  createUploadRefused(limit: QuotaLimit, retryAfterSeconds: number) {
    server.use(
      http.post<never, never, RefusedResponse>('/api/translations/uploads', () =>
        HttpResponse.json(
          { error: 'refused', limit },
          { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
        ),
      ),
    );
  },

  /** `POST /api/translations` refused because the quota ran out after the upload SAS was issued. */
  startTranslationRefused(limit: QuotaLimit, retryAfterSeconds: number) {
    server.use(
      http.post<never, never, RefusedResponse>('/api/translations', () =>
        HttpResponse.json(
          { error: 'refused', limit },
          { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
        ),
      ),
    );
  },

  /** The browser's direct `PUT` of the Source file to Blob Storage. Each call gets the next status; the last repeats. */
  blobUpload(...statuses: number[]) {
    const answers = statuses.length ? statuses : [201];
    let i = 0;
    server.use(
      http.put(`${FAKE_BLOB_ORIGIN}/*`, () => new HttpResponse(null, { status: answers[Math.min(i++, answers.length - 1)] })),
    );
  },

  startTranslation(body: StartTranslationResponse = { id: 'translation-1' }) {
    server.use(
      http.post<never, never, StartTranslationResponse>('/api/translations', () => HttpResponse.json(body, { status: 202 })),
    );
  },

  /** `POST /api/translations` refused: Azure refused the submit (502 + a failed body), or any other status. */
  startTranslationFails(httpStatus: number, body?: FailedTranslationResponse) {
    server.use(
      http.post('/api/translations', () =>
        body ? HttpResponse.json(body, { status: httpStatus }) : new HttpResponse(null, { status: httpStatus }),
      ),
    );
  },

  /** Each poll gets the next answer (a status, or `{ httpStatus }` for a failed poll); the last one repeats. */
  translationStatus(...answers: (TranslationStatusResponse | HttpFailure)[]) {
    let i = 0;
    server.use(
      http.get<{ id: string }, never, TranslationStatusResponse>('/api/translations/:id', () => {
        const answer = answers[Math.min(i++, answers.length - 1)]!;
        return isFailure(answer) ? new HttpResponse(null, { status: answer.httpStatus }) : HttpResponse.json(answer);
      }),
    );
  },

  /** Each call gets the next answer (a partial body, or `{ httpStatus }`); the last one repeats. */
  translatedFile(...answers: (Partial<TranslatedFileResponse> | HttpFailure)[]) {
    const all = answers.length ? answers : [{}];
    let i = 0;
    server.use(
      http.get<{ id: string }, never, TranslatedFileResponse>('/api/translations/:id/file', () => {
        const answer = all[Math.min(i++, all.length - 1)]!;
        if (isFailure(answer)) return new HttpResponse(null, { status: answer.httpStatus });
        return HttpResponse.json({
          url: `${FAKE_BLOB_ORIGIN}/target/translationGuid/file.pdf?sp=r&sig=fake`,
          expiresOn: '2030-01-01T00:00:00.000Z',
          extension: 'pdf',
          ...answer,
        });
      }),
    );
  },

  /** `GET /api/translations/{id}/file` after the sweep removed the Translation's blobs. */
  translatedFileExpired() {
    server.use(
      http.get<{ id: string }, never, ApiErrorResponse>('/api/translations/:id/file', () =>
        HttpResponse.json({ error: 'expired' }, { status: 410 }),
      ),
    );
  },

  /** The browser's direct `GET` of the Translated file from Blob Storage. Pass `{ httpStatus }` answers first to fail. */
  blobDownload(...answers: (string | HttpFailure)[]) {
    const all = answers.length ? answers : ['translated bytes'];
    let i = 0;
    server.use(
      http.get(`${FAKE_BLOB_ORIGIN}/*`, () => {
        const answer = all[Math.min(i++, all.length - 1)]!;
        return typeof answer === 'string'
          ? new HttpResponse(answer, { status: 200 })
          : new HttpResponse(null, { status: answer.httpStatus });
      }),
    );
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
