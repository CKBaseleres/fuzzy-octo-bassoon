import type { DocumentExtension, FailedTranslationResponse, FailureCategory, FailureReason } from '@lingo-lens/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HttpError,
  createUpload,
  deleteTranslation,
  downloadFromBlob,
  getTranslatedFile,
  getTranslationStatus,
  startTranslation,
  uploadToBlob,
} from '../api/client';
import { saveFile } from './saveFile';
import { translatedFileName } from './sourceFile';

export interface TranslationRequest {
  file: File;
  extension: DocumentExtension;
  targetLanguage: string;
}

export interface Failure {
  category: FailureCategory;
  reason?: FailureReason;
}

/**
 * One Translation at a time. The Source file and the Translated file live only
 * in memory (nothing in sessionStorage/localStorage): a refresh abandons it.
 * `guid` is our upload id, shown as the reference code when something fails.
 */
export type TranslationState =
  | { phase: 'idle' }
  | { phase: 'uploading'; request: TranslationRequest }
  | { phase: 'translating'; request: TranslationRequest; id: string; guid: string }
  | {
      phase: 'ready';
      request: TranslationRequest;
      id: string;
      guid: string;
      saved?: { blob: Blob; fileName: string };
      /** The last download or save failed; the Translation stays Ready and can be fetched again. */
      downloadFailed?: boolean;
    }
  | ({ phase: 'failed'; request: TranslationRequest; id?: string; guid?: string } & Failure);

/** Failed polls in a row the SPA keeps polling through before showing Service problem. */
export const TOLERATED_FAILED_POLLS = 3;

const SERVICE_PROBLEM: Failure = { category: 'serviceProblem' };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The failure the API reported in an error body (`POST /api/translations` answers 502 with one). */
async function reportedFailure(error: unknown): Promise<Failure | undefined> {
  if (!(error instanceof HttpError)) return undefined;
  try {
    const body = (await error.response.clone().json()) as Partial<FailedTranslationResponse>;
    return body.status === 'failed' && body.category ? { category: body.category, reason: body.reason } : undefined;
  } catch {
    return undefined;
  }
}

/** Best effort: the timer sweep is the backstop. */
const deleteQuietly = (id: string) => deleteTranslation(id).catch(() => undefined);

/**
 * Runs a Document Translation end to end:
 * upload SAS -> PUT to Blob -> start -> poll -> file SAS -> fetch -> save -> DELETE.
 * Every failure after upload ends in `failed` with a category, and DELETEs at once.
 *
 * Plug-in points: 08 maps `createUpload` refusals in `uploadRefusal`; 07 maps Expired
 * (e.g. the file SAS 404) in `download`; 05 adds the Image branch after `startTranslation`.
 */
export function useDocumentTranslation({ pollIntervalMs }: { pollIntervalMs: number }) {
  const [state, setState] = useState<TranslationState>({ phase: 'idle' });
  // Bumped on reset/unmount so a stale run stops touching state.
  const runRef = useRef(0);

  useEffect(
    () => () => {
      runRef.current++;
    },
    [],
  );

  /** Fetches a fresh file SAS, downloads and saves; on failure the Translation stays Ready. */
  const download = useCallback(async (request: TranslationRequest, id: string, guid: string, live: () => boolean) => {
    try {
      const file = await getTranslatedFile(id);
      const blob = await downloadFromBlob(file.url);
      if (!live()) return;
      const fileName = translatedFileName(request.file.name, request.targetLanguage, file.extension);
      saveFile(blob, fileName);
      setState({ phase: 'ready', request, id, guid, saved: { blob, fileName } });
    } catch {
      if (live()) setState({ phase: 'ready', request, id, guid, downloadFailed: true });
      return;
    }
    // Only after a successful save: the Translated file now lives in memory only.
    await deleteQuietly(id);
  }, []);

  const start = useCallback(
    async (request: TranslationRequest) => {
      const run = ++runRef.current;
      const live = () => runRef.current === run;
      let guid: string | undefined;
      let id: string | undefined;
      const fail = (failure: Failure) => {
        if (id) void deleteQuietly(id);
        if (live()) setState({ phase: 'failed', request, id, guid, ...failure });
      };

      setState({ phase: 'uploading', request });
      let uploadUrl: string;
      try {
        ({ uploadId: guid, uploadUrl } = await createUpload({ extension: request.extension }));
      } catch (error) {
        return fail((await uploadRefusal(error)) ?? SERVICE_PROBLEM);
      }
      try {
        await uploadToBlob(uploadUrl, request.file);
      } catch {
        return fail({ category: 'uploadFailed' });
      }
      if (!live()) return;

      try {
        ({ id } = await startTranslation({ uploadId: guid, extension: request.extension, targetLanguage: request.targetLanguage }));
      } catch (error) {
        return fail((await reportedFailure(error)) ?? SERVICE_PROBLEM);
      }
      if (!live()) return;
      setState({ phase: 'translating', request, id, guid });

      for (let failedPolls = 0; ; ) {
        try {
          const status = await getTranslationStatus(id);
          failedPolls = 0;
          if (!live()) return;
          if (status.status === 'failed') return fail({ category: status.category, reason: status.reason });
          if (status.status === 'ready') break;
        } catch {
          if (!live()) return;
          if (++failedPolls > TOLERATED_FAILED_POLLS) return fail(SERVICE_PROBLEM);
        }
        await wait(pollIntervalMs);
        if (!live()) return;
      }

      await download(request, id, guid, live);
    },
    [pollIntervalMs, download],
  );

  const retryDownload = useCallback(() => {
    if (state.phase !== 'ready') return;
    const run = runRef.current;
    void download(state.request, state.id, state.guid, () => runRef.current === run);
  }, [state, download]);

  const saveAgain = useCallback(() => {
    if (state.phase === 'ready' && state.saved) saveFile(state.saved.blob, state.saved.fileName);
  }, [state]);

  const reset = useCallback(() => {
    runRef.current++;
    setState({ phase: 'idle' });
  }, []);

  return { state, start, saveAgain, retryDownload, reset };
}

/** `POST /api/translations/uploads` failed. Ticket 08 maps 429/503 to Refused here. */
async function uploadRefusal(error: unknown): Promise<Failure | undefined> {
  return reportedFailure(error);
}
