import type { Clock } from '../clock';

export interface FakeClock extends Clock {
  set(iso: string): void;
  advance(ms: number): void;
}

export function createFakeClock(startIso = '2026-01-01T00:00:00.000Z'): FakeClock {
  let current = new Date(startIso).getTime();
  return {
    now: () => new Date(current),
    set: (iso) => {
      current = new Date(iso).getTime();
    },
    advance: (ms) => {
      current += ms;
    },
  };
}
