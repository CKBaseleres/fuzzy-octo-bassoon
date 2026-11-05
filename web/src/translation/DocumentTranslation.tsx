import {
  Button,
  Field,
  MessageBar,
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
import { ExpiredMessage } from './ExpiredMessage';
import { ImageResult } from './ImageResult';
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
  const { state, start, saveAgain, reset, translateAgain } = useDocumentTranslation({ pollIntervalMs });
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

  const onFile = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    setFile(picked);
    setCheck(picked ? checkSourceFile(picked) : undefined);
  };

  const busy = state.phase === 'uploading' || state.phase === 'translating';
  const refusal = state.phase === 'failed' ? state.refusal : undefined;
  const canStart = !busy && file !== undefined && check?.ok === true && targetLanguage !== '';
  const onTranslate = () => {
    if (canStart && file && check.ok) void start({ file, extension: check.extension, targetLanguage });
  };

  return (
    <section
      className={mergeClasses(styles.form, state.phase === 'ready' && state.image && styles.wide)}
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

      <Text role="status" aria-live="polite">
        {STATUS_TEXT[state.phase]}
      </Text>

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
          <Text>
            Saved as {state.saved?.fileName}. Your files have been deleted from Lingo Lens.
          </Text>
          <div className={styles.actions}>
            <Button appearance="primary" onClick={saveAgain}>
              Save again
            </Button>
            <Button onClick={reset}>New Translation</Button>
          </div>
        </div>
      )}

      {state.phase === 'failed' && state.category === 'expired' && <ExpiredMessage onTranslateAgain={translateAgain} />}

      {/* Ticket 09 replaces this with the per-category MessageBar, action, reference code and focus. */}
      {state.phase === 'failed' && state.category !== 'expired' && !refusal && (
        <MessageBar intent="error">
          <MessageBarBody>Lingo Lens couldn’t translate this file.</MessageBarBody>
          <Button onClick={reset}>New Translation</Button>
        </MessageBar>
      )}
    </section>
  );
}
