import { MessageBar, MessageBarBody } from '@fluentui/react-components';
import type { QuotaLimit, RefusedResponse } from '@lingo-lens/shared';
import { HttpError } from '../api/client';

/** A quota or kill-switch refusal (429), as the screen shows it. */
export interface Refusal {
  limit: QuotaLimit;
  /** Whole minutes to wait, rounded up, at least 1. */
  retryAfterMinutes: number;
}

/** The Refusal carried by a 429 from `/api`, or undefined for any other error. */
export async function readRefusal(error: unknown): Promise<Refusal | undefined> {
  if (!(error instanceof HttpError) || error.status !== 429) return undefined;
  const body = (await error.response
    .clone()
    .json()
    .catch(() => undefined)) as Partial<RefusedResponse> | undefined;
  if (body?.error !== 'refused') return undefined;
  const seconds = Number(error.response.headers.get('retry-after'));
  return {
    limit: body.limit === 'hourly' ? 'hourly' : 'daily',
    retryAfterMinutes: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : 1,
  };
}

export function refusalMessage({ limit, retryAfterMinutes }: Refusal): string {
  if (limit === 'daily') return 'Lingo Lens has reached today’s limit. Try again tomorrow.';
  return `You’ve reached the hourly limit. Try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`;
}

/** Spec category 3 (Refused): a warning with no action; the form stays so staff can try later. */
export function RefusedMessage({ refusal }: { refusal: Refusal }) {
  return (
    <MessageBar intent="warning">
      <MessageBarBody>{refusalMessage(refusal)}</MessageBarBody>
    </MessageBar>
  );
}
