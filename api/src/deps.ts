import type { HttpHandler } from '@azure/functions';
import type { AzureServices } from './azure/port';
import type { Clock } from './clock';

/** Everything a handler may depend on. Production wiring lives in `index.ts`. */
export interface Deps {
  azure: AzureServices;
  clock: Clock;
  /** Overall timeouts from the start (`DOCUMENT_TIMEOUT_MINUTES`, `IMAGE_TIMEOUT_MINUTES`). */
  timeouts: Timeouts;
}

export interface Timeouts {
  documentMinutes: number;
  imageMinutes: number;
}

/** The spec's defaults, used when an app setting is missing or not a positive number. */
export const DEFAULT_TIMEOUTS: Timeouts = { documentMinutes: 15, imageMinutes: 3 };

/** Each HTTP Function is written as a factory over `Deps`, so tests can inject fakes. */
export type HttpHandlerFactory = (deps: Deps) => HttpHandler;
