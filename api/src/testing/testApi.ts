import { HttpRequest, HttpResponse, InvocationContext, type LogLevel } from '@azure/functions';
import type { Deps, HttpHandlerFactory } from '../deps';
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
}

/**
 * Seam 1 harness: Function handlers against an in-memory Azure and a fake clock.
 * Arrange Azure through `api.azure` (its `state`), then assert on the response
 * and on `api.azure.state`.
 */
export function createTestApi(options: { now?: string } = {}): TestApi {
  const clock = createFakeClock(options.now);
  const azure = createFakeAzureServices({ clock });
  const deps: Deps = { azure, clock };
  const logs: LogEntry[] = [];

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
      const result = await handler(httpRequest, new InvocationContext({
          functionName: 'test',
          logHandler: (level, ...args) => logs.push({ level, args }),
        }));
      const response = result instanceof HttpResponse ? result : new HttpResponse(result);
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        json<T>() {
          return JSON.parse(text) as T;
        },
      };
    },
  };
}
