import type {
  ApiErrorResponse,
  CreateUploadResponse,
  FailedTranslationResponse,
  LanguagesResponse,
  QuotaLimit,
  RefusedResponse,
  StartTranslationResponse,
  TranslatedFileResponse,
  TranslationStatusResponse,
} from '@lingo-lens/shared';
import type { Page, Route } from '@playwright/test';

/**
 * The browser seam's network boundary: `/api` and Blob Storage, faked with
 * `page.route`, typed by the `shared` contract (the Playwright twin of
 * `src/test/mockApi.ts`). Like MSW's `server.use`, a later route wins.
 */
export const FAKE_BLOB_ORIGIN = 'https://fake.blob.core.windows.net';

export const UPLOAD_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

/** An answer that is an HTTP failure instead of a body. */
export interface HttpFailure {
  httpStatus: number;
}

const isFailure = (answer: object): answer is HttpFailure => 'httpStatus' in answer;

/** The SPA calls Blob Storage cross-origin with SAS URLs, so its answers need CORS headers. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, PUT, OPTIONS',
  'access-control-allow-headers': '*',
};

const json = <T>(route: Route, body: T, status = 200, headers: Record<string, string> = {}) =>
  route.fulfill({ status, json: body, headers });

/** Answers each call with the next answer; the last one repeats. */
const sequence = <T>(answers: T[]) => {
  let i = 0;
  return () => answers[Math.min(i++, answers.length - 1)]!;
};

export function fakeApi(page: Page) {
  const api = {
    async languages(languages: LanguagesResponse['languages']) {
      await page.route('**/api/languages', (route) => json<LanguagesResponse>(route, { languages }));
    },

    async createUpload() {
      await page.route('**/api/translations/uploads', (route) =>
        json<CreateUploadResponse>(route, {
          translationGuid: UPLOAD_ID,
          uploadUrl: `${FAKE_BLOB_ORIGIN}/source/${UPLOAD_ID}/file.bin?sp=cw&sig=fake`,
          expiresOn: '2030-01-01T00:00:00.000Z',
        }),
      );
    },

    async createUploadRefused(limit: QuotaLimit, retryAfterSeconds: number) {
      await page.route('**/api/translations/uploads', (route) =>
        json<RefusedResponse>(route, { error: 'refused', limit }, 429, { 'retry-after': String(retryAfterSeconds) }),
      );
    },

    /** The direct `PUT` to Blob Storage. Each call gets the next status; the last repeats. */
    async blobUpload(...statuses: number[]) {
      const next = sequence(statuses.length ? statuses : [201]);
      await page.route(`${FAKE_BLOB_ORIGIN}/source/**`, (route) =>
        route.request().method() === 'OPTIONS'
          ? route.fulfill({ status: 204, headers: CORS })
          : route.fulfill({ status: next(), headers: CORS }),
      );
    },

    /** Holds the `PUT` open, so the screen stays in Uploading. */
    async blobUploadHangs() {
      await page.route(`${FAKE_BLOB_ORIGIN}/source/**`, (route) =>
        route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS }) : undefined,
      );
    },

    async startTranslation(body: StartTranslationResponse = { id: 'translation-1' }) {
      await page.route('**/api/translations', (route) => json<StartTranslationResponse>(route, body, 202));
    },

    async startTranslationFails(httpStatus: number, body: FailedTranslationResponse) {
      await page.route('**/api/translations', (route) => json<FailedTranslationResponse>(route, body, httpStatus));
    },

    async translationStatus(...answers: (TranslationStatusResponse | HttpFailure)[]) {
      const next = sequence(answers);
      await page.route('**/api/translations/translation-1', (route) => {
        if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 });
        const answer = next();
        return isFailure(answer) ? route.fulfill({ status: answer.httpStatus }) : json(route, answer);
      });
    },

    async translatedFile(...answers: (Partial<TranslatedFileResponse> | HttpFailure)[]) {
      const next = sequence(answers.length ? answers : [{}]);
      await page.route('**/api/translations/translation-1/file', (route) => {
        const answer = next();
        if (isFailure(answer)) return route.fulfill({ status: answer.httpStatus });
        return json<TranslatedFileResponse>(route, {
          url: `${FAKE_BLOB_ORIGIN}/target/${UPLOAD_ID}/file.pdf?sp=r&sig=fake`,
          expiresOn: '2030-01-01T00:00:00.000Z',
          extension: 'pdf',
          ...answer,
        });
      });
    },

    async translatedFileExpired() {
      await page.route('**/api/translations/translation-1/file', (route) =>
        json<ApiErrorResponse>(route, { error: 'expired' }, 410),
      );
    },

    async blobDownload(...answers: (string | HttpFailure)[]) {
      const next = sequence(answers.length ? answers : ['translated bytes']);
      await page.route(`${FAKE_BLOB_ORIGIN}/target/**`, (route) => {
        const answer = next();
        return typeof answer === 'string'
          ? route.fulfill({ status: 200, body: answer, headers: { ...CORS, 'content-type': 'application/pdf' } })
          : route.fulfill({ status: answer.httpStatus, headers: CORS });
      });
    },
  };
  return api;
}

export type FakeApi = ReturnType<typeof fakeApi>;
