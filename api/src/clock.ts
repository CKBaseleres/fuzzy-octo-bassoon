/** Time source. Handlers read (and wait on) time only through this, so tests control it. */
export interface Clock {
  now(): Date;
  /** Waits `ms` milliseconds (backoff between retries). */
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
