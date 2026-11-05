import { Button, MessageBar, MessageBarActions, MessageBarBody } from '@fluentui/react-components';
import { useEffect, useRef } from 'react';

export const EXPIRED_TEXT = 'This translation has expired, please start again.';

/**
 * Failure category 7 (Expired): the 1-hour sweep removed the files before download.
 * Focus moves to the message; Translate again reuses the in-memory file and language.
 */
export function ExpiredMessage({ onTranslateAgain }: { onTranslateAgain: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <MessageBar intent="error" ref={ref} tabIndex={-1}>
      <MessageBarBody>{EXPIRED_TEXT}</MessageBarBody>
      <MessageBarActions>
        <Button onClick={onTranslateAgain}>Translate again</Button>
      </MessageBarActions>
    </MessageBar>
  );
}
