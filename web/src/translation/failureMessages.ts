import type { FailureCategory, FailureReason } from '@lingo-lens/shared';

/** The one action a failure message may offer. */
export type FailureAction =
  /** Runs the whole Translation again with the in-memory file and the same language (new SAS and GUID). */
  | { kind: 'retry'; label: 'Try again' | 'Translate again' }
  /** Back to the picker. */
  | { kind: 'chooseAnotherFile'; label: 'Choose another file' };

export interface FailureMessage {
  /** `warning` only for No text found (spec: "Status, errors and accessibility"). */
  intent: 'error' | 'warning';
  /** The message the staff member reads. The SPA owns every word; the API sends only codes. */
  text: string;
  action?: FailureAction;
}

/** What a message may depend on. Tickets may add fields (e.g. 08: minutes to wait). */
export interface FailureDetails {
  category: FailureCategory;
  reason?: FailureReason;
  /** The Source file's extension, lower case, e.g. `pdf`. */
  extension: string;
}

const TRY_AGAIN: FailureAction = { kind: 'retry', label: 'Try again' };
const CHOOSE_ANOTHER_FILE: FailureAction = { kind: 'chooseAnotherFile', label: 'Choose another file' };

const CANT_TRANSLATE: Record<FailureReason | 'generic', (d: FailureDetails) => string> = {
  generic: () =>
    'Lingo Lens couldn’t translate this file. It may be damaged, protected, or not the format its name suggests. Check it opens normally and try another file.',
  passwordProtected: () => 'This file is password-protected or encrypted. Remove the protection and try again.',
  damaged: (d) => `This file looks damaged or isn’t a real ${d.extension.toUpperCase()} file.`,
  badDimensions: () => 'This image is too small or too large to read.',
};

/**
 * One entry per failure category (spec categories 2-7). To change what a
 * category says or offers, edit its entry only:
 *   - 07 owns `expired`, 08 owns `refused`, 10 owns `noTextFound`.
 */
export const FAILURE_MESSAGES: { [C in FailureCategory]: (details: FailureDetails) => FailureMessage } = {
  uploadFailed: () => ({
    intent: 'error',
    text: 'The upload didn’t finish. Check your connection and try again.',
    action: TRY_AGAIN,
  }),
  refused: () => ({
    // Ticket 08 replaces this with the fixed quota and kill-switch messages.
    intent: 'error',
    text: 'Lingo Lens can’t take this translation right now.',
  }),
  cantTranslate: (d) => ({
    intent: 'error',
    text: CANT_TRANSLATE[d.reason ?? 'generic'](d),
    action: CHOOSE_ANOTHER_FILE,
  }),
  noTextFound: () => ({
    // Ticket 10 owns the wording (spec: "Try a sharper, straighter photo...").
    intent: 'warning',
    text: 'Lingo Lens found no text in this image. Try a sharper, straighter photo. Some handwriting and languages can’t be read.',
    action: CHOOSE_ANOTHER_FILE,
  }),
  serviceProblem: () => ({
    intent: 'error',
    text: 'Lingo Lens is busy, try again in a minute.',
    action: TRY_AGAIN,
  }),
  expired: () => ({
    // Ticket 07 owns the wording.
    intent: 'error',
    text: 'This translation has expired, please start again.',
    action: { kind: 'retry', label: 'Translate again' },
  }),
};

export const failureMessage = (details: FailureDetails): FailureMessage => FAILURE_MESSAGES[details.category](details);

/** "Reference: <first 8 characters of the GUID>". */
export const referenceCode = (guid: string) => guid.slice(0, 8);
