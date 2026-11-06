import type {
  CreateUploadBody,
  CreateUploadResponse,
  HealthResponse,
  LanguagesResponse,
  StartTranslationBody,
  StartTranslationResponse,
  TranslatedFileResponse,
  TranslationStatusResponse,
} from '@lingo-lens/shared';

/** Thrown for any non-2xx answer, so callers (ticket 09) can tell HTTP failures apart. */
export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly response: Response,
  ) {
    super(`${url} responded ${status}`);
    this.name = 'HttpError';
  }
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) throw new HttpError(url, response.status, response);
  return response;
}

/** Thin typed wrappers over `/api`. Responses are typed by the `shared` contract. */
async function getJson<T>(path: string): Promise<T> {
  return (await (await request(path, { headers: { accept: 'application/json' } })).json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await request(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

export const getHealth = () => getJson<HealthResponse>('/api/health');

export const getLanguages = () => getJson<LanguagesResponse>('/api/languages');

export const createUpload = (body: CreateUploadBody) =>
  postJson<CreateUploadResponse>('/api/translations/uploads', body);

export const startTranslation = (body: StartTranslationBody) =>
  postJson<StartTranslationResponse>('/api/translations', body);

const translationPath = (id: string) => `/api/translations/${encodeURIComponent(id)}`;

export const getTranslationStatus = (id: string) => getJson<TranslationStatusResponse>(translationPath(id));

export const getTranslatedFile = (id: string) => getJson<TranslatedFileResponse>(`${translationPath(id)}/file`);

export const deleteTranslation = async (id: string) => {
  await request(translationPath(id), { method: 'DELETE' });
};

// --- Blob Storage, reached directly with the SAS URLs the API hands out ---------

/** `PUT`s the Source file to its write-only SAS URL (Put Blob, one request). */
export const uploadToBlob = async (uploadUrl: string, file: Blob) => {
  await request(uploadUrl, {
    method: 'PUT',
    headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });
};

/** Fetches the Translated file into memory through its read-only SAS URL. */
export const downloadFromBlob = async (url: string) => (await request(url)).blob();
