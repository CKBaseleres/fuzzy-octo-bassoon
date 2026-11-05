/** Time source. Handlers read time only through this, so tests control it. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
