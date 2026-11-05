import { Button, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';
import { useEffect, useId, useRef } from 'react';
import { failureMessage, referenceCode, type FailureAction, type FailureDetails } from './failureMessages';

/**
 * A failed Translation: one sentence, at most one action, and the reference code.
 * It takes the place of the status area, and focus moves to it when it appears.
 */
export function FailureMessageBar({
  failure,
  guid,
  onAction,
}: {
  failure: FailureDetails;
  /** Unknown only when the upload could not even be prepared. */
  guid?: string;
  onAction: (action: FailureAction) => void;
}) {
  const message = failureMessage(failure);
  const ref = useRef<HTMLDivElement>(null);
  // Fluent names the group by a MessageBarTitle; most messages have none, so name it by the message itself.
  const messageId = useId();

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <MessageBar ref={ref} tabIndex={-1} intent={message.intent} layout="multiline" aria-labelledby={messageId}>
      <MessageBarBody>
        <div id={messageId}>
          {message.title && <MessageBarTitle>{message.title}</MessageBarTitle>}
          {message.text}
        </div>
        {guid && <div>Reference: {referenceCode(guid)}</div>}
      </MessageBarBody>
      {message.action && (
        <MessageBarActions>
          <Button onClick={() => onAction(message.action!)}>{message.action.label}</Button>
        </MessageBarActions>
      )}
    </MessageBar>
  );
}
