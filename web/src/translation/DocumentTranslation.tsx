import {
  Button,
  Field,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Select,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
  typographyStyles,
} from '@fluentui/react-components';
import type { Language } from '@lingo-lens/shared';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { getLanguages } from '../api/client';
import { FailureMessageBar } from './FailureMessageBar';
import type { FailureAction } from './failureMessages';
import { ImageNoText, ImageResult } from './ImageResult';
import { RefusedMessage } from './refusal';
import { ACCEPT, checkSourceFile, type SourceFileCheck } from './sourceFile';
import { useDocumentTranslation } from './useDocumentTranslation';

const useStyles = makeStyles({
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '36rem',
  },
  /** The Image result uses the full width (two columns). */
  wide: {
    maxWidth: 'none',
  },
  result: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  heading: {
    ...typographyStyles.title2,
    margin: 0,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
  },
});

const STATUS_TEXT = {
  idle: '',
  uploading: 'Uploading…',
  translating: 'Translating…',
  ready: 'Ready',
  failed: '',
} as const;

export const PDF_NOTE = 'Scanned pages in mixed PDFs may stay untranslated.';

export function DocumentTranslation({ pollIntervalMs = 2000 }: { pollIntervalMs?: number }) {
  const styles = useStyles();
  const fileInputId = useId();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [file, setFile] = useState<File>();
  const [check, setCheck] = useState<SourceFileCheck>();
  const [targetLanguage, setTargetLanguage] = useState('');
  const { state, start, saveAgain, retryDownload, reset, translateAgain } = useDocumentTranslation({ pollIntervalMs });
  const resultHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    getLanguages().then(
      (body) => active && setLanguages(body.languages),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state.phase === 'ready') resultHeading.current?.focus();
  }, [state.phase]);

  const latestPick = useRef<File>(undefined);
  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    latestPick.current = picked;
    setFile(picked);
    setCheck(undefined);
    // The checks read the file's bytes; a slower check for an earlier pick must not win.
    if (picked) void checkSourceFile(picked).then((result) => latestPick.current === picked && setCheck(result));
  };

  const busy = state.phase === 'uploading' || state.phase === 'translating';
  const refusal = state.phase === 'failed' ? state.refusal : undefined;
  const canStart = !busy && file !== undefined && check?.ok === true && targetLanguage !== '';
  const onTranslate = () => {
    if (canStart && file && check.ok) void start({ file, extension: check.extension, targetLanguage });
  };
  const onFailureAction = (action: FailureAction) => {
    if (action.kind === 'retry') translateAgain();
    else reset();
  };

  const failureBar = state.phase === 'failed' && !refusal && (
    <FailureMessageBar
      // A new failure (e.g. after Try again) mounts a new bar, so focus moves again.
      key={`${state.guid ?? ''}-${state.category}`}
      failure={{ category: state.category, reason: state.reason, extension: state.request.extension }}
      guid={state.guid}
      onAction={onFailureAction}
    />
  );
  /** No text found keeps the Image on screen, the message beside it (ticket 10). */
  const failedImageUrl = state.phase === 'failed' ? state.imageUrl : undefined;

  return (
    <section
      className={mergeClasses(styles.form, ((state.phase === 'ready' && state.image) || failedImageUrl) && styles.wide)}
      aria-label="Translate a file"
    >
      {refusal && <RefusedMessage refusal={refusal} />}

      {state.phase === 'idle' || busy || refusal ? (
        <>
          <Field
            label={{ children: 'File to translate', htmlFor: fileInputId }}
            hint="Documents up to 40 MB · Images up to 20 MB"
            validationMessage={check && !check.ok ? check.message : undefined}
          >
            <input id={fileInputId} type="file" accept={ACCEPT} onChange={onFile} disabled={busy} />
          </Field>
          {check?.ok && check.extension === 'pdf' && (
            <MessageBar intent="info">
              <MessageBarBody>{PDF_NOTE}</MessageBarBody>
            </MessageBar>
          )}
          <Field label="Translate into" hint="The file’s language is detected automatically.">
            <Select value={targetLanguage} onChange={(_e, data) => setTargetLanguage(data.value)} disabled={busy}>
              <option value="" disabled>
                Choose a language
              </option>
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className={styles.actions}>
            <Button appearance="primary" disabled={!canStart} onClick={onTranslate}>
              Translate
            </Button>
          </div>
        </>
      ) : null}

      {/* Stays mounted (empty while failed) so later statuses are still announced. */}
      <Text role="status" aria-live="polite">
        {STATUS_TEXT[state.phase]}
      </Text>
      {/* Refusals (ticket 08) show above the form instead. */}
      {failureBar && failedImageUrl ? (
        <ImageNoText fileName={state.request.file.name} imageUrl={failedImageUrl} message={failureBar} />
      ) : (
        failureBar
      )}

      {state.phase === 'ready' && state.image && state.imageUrl && (
        <ImageResult
          fileName={state.request.file.name}
          imageUrl={state.imageUrl}
          result={state.image}
          targetLanguage={state.request.targetLanguage}
          languages={languages}
          headingRef={resultHeading}
          onNewTranslation={reset}
        />
      )}

      {state.phase === 'ready' && !state.image && (
        <div className={styles.result}>
          <h2 className={styles.heading} ref={resultHeading} tabIndex={-1}>
            Your translation is ready
          </h2>
          {state.saved ? (
            <Text>Saved as {state.saved.fileName}. Your files have been deleted from Lingo Lens.</Text>
          ) : state.downloadFailed ? (
            <MessageBar intent="error">
              <MessageBarBody>Download failed.</MessageBarBody>
              <MessageBarActions>
                <Button onClick={retryDownload}>Try again</Button>
              </MessageBarActions>
            </MessageBar>
          ) : null}
          <div className={styles.actions}>
            {state.saved && (
              <Button appearance="primary" onClick={saveAgain}>
                Save again
              </Button>
            )}
            <Button onClick={reset}>New Translation</Button>
          </div>
        </div>
      )}
    </section>
  );
}
