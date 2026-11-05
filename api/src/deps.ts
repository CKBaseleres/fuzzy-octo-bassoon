import type { HttpHandler, TimerHandler } from '@azure/functions';
import type { AzureServices } from './azure/port';
import type { Clock } from './clock';

/** Everything a handler may depend on. Production wiring lives in `index.ts`. */
export interface Deps {
  azure: AzureServices;
  clock: Clock;
}

/** Each HTTP Function is written as a factory over `Deps`, so tests can inject fakes. */
export type HttpHandlerFactory = (deps: Deps) => HttpHandler;

/** Timer Functions follow the same factory pattern. */
export type TimerHandlerFactory = (deps: Deps) => TimerHandler;
