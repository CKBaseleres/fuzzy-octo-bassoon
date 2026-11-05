import type { DocumentExtension, FailureCategory, FailureReason } from '@lingo-lens/shared';
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
import { saveFile } from './saveFile';
import { translatedFileName } from './sourceFile';

export interface TranslationRequest {
  file: File;
  extension: DocumentExtension;
  targetLanguage: string;
}

/**
 * One Translation at a time. The Source file and the Translated file live only
 * in memory (nothing in sessionStorage/localStorage): a refresh abandons it.
 */
export type TranslationState =
  | { phase: 'idle' }
  | { phase: 'uploading'; request: TranslationRequest }
  | { phase: 'translating'; request: TranslationRequest; id: string }
  | { phase: 'ready'; request: TranslationRequest; id: string; saved?: { blob: Blob; fileName: string } }
  | { phase: 'failed'; request: TranslationRequest; id?: string; category: FailureCategory; reason?: FailureReason };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a Document Translation end to end:
 * upload SAS -> PUT to Blob -> start -> poll -> file SAS -> fetch -> save -> DELETE.
 *
 * Plug-in points: ticket 09 replaces the `catch` (categories, retries, 3 tolerated
 * poll failures, best-effort DELETE, "Download failed. Try again"); ticket 05 adds
 * the Image branch after `startTranslation`.
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

  const start = useCallback(
    async (request: TranslationRequest) => {
      const run = ++runRef.current;
      const live = () => runRef.current === run;
      let id: string | undefined;
      try {
        setState({ phase: 'uploading', request });
        const upload = await createUpload({ extension: request.extension });
        await uploadToBlob(upload.uploadUrl, request.file);
        if (!live()) return;

        ({ id } = await startTranslation({
          uploadId: upload.uploadId,
          extension: request.extension,
          targetLanguage: request.targetLanguage,
        }));
        if (!live()) return;
        setState({ phase: 'translating', request, id });

        for (;;) {
          const status = await getTranslationStatus(id);
          if (!live()) return;
          if (status.status === 'failed') {
            setState({ phase: 'failed', request, id, category: status.category, reason: status.reason });
            return;
          }
          if (status.status === 'ready') break;
          await wait(pollIntervalMs);
          if (!live()) return;
        }

        const file = await getTranslatedFile(id);
        const blob = await downloadFromBlob(file.url);
        if (!live()) return;
        const fileName = translatedFileName(request.file.name, request.targetLanguage, file.extension);
        saveFile(blob, fileName);
        setState({ phase: 'ready', request, id, saved: { blob, fileName } });
        // Only after a successful save: the Translated file now lives in memory only.
        await deleteTranslation(id);
      } catch (error) {
        // 410 from the file request: the sweep removed the Translation's blobs (ticket 07).
        const category = error instanceof HttpError && error.status === 410 ? 'expired' : 'serviceProblem';
        if (live()) setState({ phase: 'failed', request, id, category });
      }
    },
    [pollIntervalMs],
  );

  const saveAgain = useCallback(() => {
    if (state.phase === 'ready' && state.saved) saveFile(state.saved.blob, state.saved.fileName);
  }, [state]);

  const reset = useCallback(() => {
    runRef.current++;
    setState({ phase: 'idle' });
  }, []);

  /** Runs the whole Translation again with the same in-memory file and target language. */
  const translateAgain = useCallback(() => {
    if (state.phase === 'failed') void start(state.request);
  }, [state, start]);

  return { state, start, saveAgain, reset, translateAgain };
}
