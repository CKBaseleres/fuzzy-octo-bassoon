import { HttpRequest, HttpResponse, InvocationContext, type LogLevel } from '@azure/functions';
import type { Deps, HttpHandlerFactory, TimerHandlerFactory } from '../deps';
import { withApiHeaders } from '../guardrails/apiHeaders';
import type { Limits } from '../guardrails/limits';
import { createFakeAzureServices, type FakeAzureServices } from './fakeAzureServices';
import { createFakeClock, type FakeClock } from './fakeClock';

export interface TestRequest {
  method: 'GET' | 'POST' | 'DELETE';
  /** Full path as the SPA sees it, e.g. `/api/translations/abc`. */
  path: string;
  /** Route parameters, e.g. `{ id: 'abc' }` for `translations/{id}`. */
  params?: Record<string, string>;
  headers?: Record<string, string>;
  /** Serialised as JSON. */
  body?: unknown;
}

export interface TestResponse {
  status: number;
  headers: Headers;
  /** The parsed JSON body. Type it with the `shared` contract type. */
  json<T>(): T;
}

export interface LogEntry {
  level: LogLevel;
  /** Everything the handler passed to `context.log`/`warn`/`error`. */
  args: unknown[];
}

export interface TestApi {
  azure: FakeAzureServices;
  /** Every log line any handler wrote, in order. Assert that no filename or content leaks. */
  logs: LogEntry[];
  clock: FakeClock;
  deps: Deps;
  /** Builds the handler from its factory with this API's deps and invokes it like the Functions host would. */
  call(factory: HttpHandlerFactory, request: TestRequest): Promise<TestResponse>;
  /** Builds a timer Function from its factory and fires it once, like the host would on schedule. */
  runTimer(factory: TimerHandlerFactory): Promise<void>;
}

/**
 * Seam 1 harness: Function handlers against an in-memory Azure and a fake clock.
 * Arrange Azure through `api.azure` (its `state`), then assert on the response
 * and on `api.azure.state`.
 */
/** Generous enough that tests about other things never hit a quota. */
export const TEST_LIMITS: Limits = { translationsEnabled: true, dailyQuota: 1000, hourlyPerIpQuota: 1000 };

export function createTestApi(options: { now?: string; limits?: Partial<Limits> } = {}): TestApi {
  const clock = createFakeClock(options.now);
  const azure = createFakeAzureServices({ clock });
  const deps: Deps = { azure, clock, limits: { ...TEST_LIMITS, ...options.limits } };
  const logs: LogEntry[] = [];
  const context = () =>
    new InvocationContext({
      functionName: 'test',
      logHandler: (level, ...args) => logs.push({ level, args }),
    });

  return {
    azure,
    logs,
    clock,
    deps,
    async call(factory, request) {
      const handler = factory(deps);
      const httpRequest = new HttpRequest({
        method: request.method,
        url: `http://localhost${request.path}`,
        headers: request.body === undefined ? request.headers : { 'content-type': 'application/json', ...request.headers },
        params: request.params,
        body: request.body === undefined ? undefined : { string: JSON.stringify(request.body) },
      });
      const result = await handler(httpRequest, context());
      // Mirrors the host: index.ts adds these to every HTTP result in a postInvocation hook.
      const withHeaders = withApiHeaders(result ?? {});
      const response = withHeaders instanceof HttpResponse ? withHeaders : new HttpResponse(withHeaders);
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        json<T>() {
          return JSON.parse(text) as T;
        },
      };
    },
    async runTimer(factory) {
      const now = clock.now().toISOString();
      await factory(deps)(
        { isPastDue: false, schedule: { adjustForDST: false }, scheduleStatus: { last: now, next: now, lastUpdated: now } },
        context(),
      );
    },
  };
}
