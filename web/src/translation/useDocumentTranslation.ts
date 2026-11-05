import type {
  DocumentExtension,
  FailedTranslationResponse,
  FailureCategory,
  FailureReason,
  ImageExtension,
  ImageTranslationResult,
} from '@lingo-lens/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createUpload,
  deleteTranslation,
  downloadFromBlob,
  getTranslatedFile,
  getTranslationStatus,
  HttpError,
  startTranslation,
  uploadToBlob,
} from '../api/client';
import { readRefusal, type Refusal } from './refusal';
import { saveFile } from './saveFile';
import { translatedFileName } from './sourceFile';

export interface TranslationRequest {
  file: File;
  extension: DocumentExtension | ImageExtension;
  targetLanguage: string;
}

export interface Failure {
  category: FailureCategory;
  reason?: FailureReason;
  /** Set with category `refused`: a quota or the kill switch said no (ticket 08). */
  refusal?: Refusal;
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
      /** Document: the Translated file, kept in memory for "Save again". */
      saved?: { blob: Blob; fileName: string };
      /** Document: the last download or save failed; the Translation stays Ready and can be fetched again. */
      downloadFailed?: boolean;
      /** Image: the result, held only in memory (Azure has already deleted everything). */
      image?: ImageTranslationResult;
      /** Image: an object URL of the Source file, so it is shown without being downloaded back. */
      imageUrl?: string;
    }
  | ({
      phase: 'failed';
      request: TranslationRequest;
      id?: string;
      guid?: string;
      /** Image with No text found: the Image is still shown, from an object URL of the Source file. */
      imageUrl?: string;
    } & Failure);

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

/** A refusal (429, ticket 08), a failure the API reported (502), or Service problem. */
async function requestFailure(error: unknown): Promise<Failure> {
  const refusal = await readRefusal(error);
  if (refusal) return { category: 'refused', refusal };
  return (await reportedFailure(error)) ?? SERVICE_PROBLEM;
}

/** 410 from the file request: the sweep removed the Translation's blobs (ticket 07). */
const isExpired = (error: unknown) => error instanceof HttpError && error.status === 410;

/** Best effort: the timer sweep is the backstop. */
const deleteQuietly = (id: string) => deleteTranslation(id).catch(() => undefined);

/**
 * Runs a Translation end to end:
 * upload SAS -> PUT to Blob -> start -> poll -> (Document) file SAS -> fetch -> save -> DELETE.
 * Every failure after upload ends in `failed` with a category and DELETEs at once;
 * a failed download leaves the Translation Ready ("Download failed. Try again").
 * For an Image the ready poll carries the whole result and the run ends there.
 */
export function useDocumentTranslation({ pollIntervalMs }: { pollIntervalMs: number }) {
  const [state, setState] = useState<TranslationState>({ phase: 'idle' });
  // Bumped on reset/unmount so a stale run stops touching state.
  const runRef = useRef(0);
  // The object URL showing an Image result; revoked when the result goes away.
  const imageUrlRef = useRef<string | undefined>(undefined);
  const releaseImage = useCallback(() => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    imageUrlRef.current = undefined;
  }, []);

  useEffect(
    () => () => {
      runRef.current++;
      releaseImage();
    },
    [releaseImage],
  );

  /** Fetches a fresh file SAS, downloads and saves. Only a successful save DELETEs. */
  const download = useCallback(async (request: TranslationRequest, id: string, guid: string, live: () => boolean) => {
    try {
      const file = await getTranslatedFile(id);
      const blob = await downloadFromBlob(file.url);
      if (!live()) return;
      const fileName = translatedFileName(request.file.name, request.targetLanguage, file.extension);
      saveFile(blob, fileName);
      setState({ phase: 'ready', request, id, guid, saved: { blob, fileName } });
    } catch (error) {
      if (!live()) return;
      if (isExpired(error)) setState({ phase: 'failed', request, id, guid, category: 'expired' });
      else setState({ phase: 'ready', request, id, guid, downloadFailed: true });
      return;
    }
    // The Translated file now lives in memory only.
    await deleteQuietly(id);
  }, []);

  const start = useCallback(
    async (request: TranslationRequest) => {
      const run = ++runRef.current;
      releaseImage();
      const live = () => runRef.current === run;
      let guid: string | undefined;
      let id: string | undefined;
      const fail = (failure: Failure, imageUrl?: string) => {
        if (id) void deleteQuietly(id);
        if (live()) setState({ phase: 'failed', request, id, guid, ...failure, ...(imageUrl ? { imageUrl } : {}) });
      };
      const showImage = () => (imageUrlRef.current = URL.createObjectURL(request.file));

      setState({ phase: 'uploading', request });
      let uploadUrl: string;
      try {
        ({ uploadId: guid, uploadUrl } = await createUpload({ extension: request.extension }));
      } catch (error) {
        return fail(await requestFailure(error));
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
        return fail(await requestFailure(error));
      }
      if (!live()) return;
      setState({ phase: 'translating', request, id, guid });

      for (let failedPolls = 0; ; ) {
        try {
          const status = await getTranslationStatus(id);
          failedPolls = 0;
          if (!live()) return;
          if (status.status === 'failed') {
            // No text found keeps the Image on screen (spec: "Image result screen").
            const imageUrl = status.category === 'noTextFound' ? showImage() : undefined;
            return fail({ category: status.category, reason: status.reason }, imageUrl);
          }
          if (status.status === 'ready' && status.kind === 'image') {
            // The poll that returned the result also deleted the Image and the analyze result.
            const { status: _status, kind: _kind, ...image } = status;
            setState({ phase: 'ready', request, id, guid, image, imageUrl: showImage() });
            return;
          }
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
    [pollIntervalMs, releaseImage, download],
  );

  /** "Download failed. Try again": a new file SAS, then download and save again. */
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
    releaseImage();
    setState({ phase: 'idle' });
  }, [releaseImage]);

  /** Runs the whole Translation again with the same in-memory file and target language. */
  const translateAgain = useCallback(() => {
    if (state.phase === 'failed') void start(state.request);
  }, [state, start]);

  return { state, start, saveAgain, retryDownload, reset, translateAgain };
}
