import type { HttpHandler } from '@azure/functions';
import type { AzureServices } from './azure/port';
import type { Clock } from './clock';
import type { Limits } from './guardrails/limits';

/** Everything a handler may depend on. Production wiring lives in `index.ts`. */
export interface Deps {
  azure: AzureServices;
  clock: Clock;
  /** Kill switch and quotas, from app settings (ticket 08). */
  limits: Limits;
}

/** Each HTTP Function is written as a factory over `Deps`, so tests can inject fakes. */
export type HttpHandlerFactory = (deps: Deps) => HttpHandler;
