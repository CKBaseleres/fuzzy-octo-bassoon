import { AsyncLocalStorage } from 'node:async_hooks';
import type { Clock } from '../clock';
import { AzureServiceError, type AzureServiceName, type AzureServices } from './port';

/** SWA cuts every `/api` request off at 45 seconds. */
export const REQUEST_BUDGET_MS = 45_000;
export const MAX_RETRIES = 3;
/** Waits are 1 s, 2 s, 4 s. */
export const BASE_DELAY_MS = 1000;

/**
 * Services whose calls this wrapper retries. Blob and Table Storage are left
 * out: their SDKs retry on their own (see `blobAdapter.ts` retryOptions).
 */
const RETRIED_SERVICES: readonly AzureServiceName[] = ['documentTranslation', 'documentIntelligence', 'textTranslation'];

/** 429, 5xx, and no response at all (status 0). */
export const isRetryable = (error: unknown) =>
  error instanceof AzureServiceError &&
  (error.httpStatus === 429 || error.httpStatus === 0 || (error.httpStatus >= 500 && error.httpStatus <= 599));

const requestStart = new AsyncLocalStorage<number>();

/**
 * Runs one `/api` request, so retries inside it share its 45-second budget.
 * `index.ts` wraps every Function invocation in it; the Seam 1 harness wraps every call.
 */
export function withinRequestBudget<T>(clock: Clock, run: () => T): T {
  return requestStart.run(clock.now().getTime(), run);
}

/**
 * Wraps the Azure services port so 429/5xx answers are retried up to 3 times
 * with exponential backoff, within the current request's 45-second budget.
 * A retry is skipped when the wait plus another attempt as slow as the last one
 * would overrun the budget; the last error is then thrown for the classifier.
 */
export function withRetries(services: AzureServices, clock: Clock): AzureServices {
  const now = () => clock.now().getTime();

  async function retrying<T>(attempt: () => Promise<T>): Promise<T> {
    const start = requestStart.getStore() ?? now();
    for (let retry = 0; ; retry += 1) {
      const attemptStart = now();
      try {
        return await attempt();
      } catch (error) {
        const delay = BASE_DELAY_MS * 2 ** retry;
        const attemptMs = now() - attemptStart;
        const fits = now() + delay + attemptMs - start <= REQUEST_BUDGET_MS;
        if (retry >= MAX_RETRIES || !isRetryable(error) || !fits) throw error;
        await clock.sleep(delay);
      }
    }
  }

  const wrapped = { ...services } as Record<string, unknown>;
  for (const name of RETRIED_SERVICES) {
    const port = services[name] as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    wrapped[name] = Object.fromEntries(
      Object.keys(port).map((method) => [method, (...args: unknown[]) => retrying(() => port[method]!(...args))]),
    );
  }
  return wrapped as unknown as AzureServices;
}
