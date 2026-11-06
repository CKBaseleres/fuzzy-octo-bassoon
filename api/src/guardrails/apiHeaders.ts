import type { HttpHandler, HttpResponse, HttpResponseInit } from '@azure/functions';
import type { ApiErrorResponse } from '@lingo-lens/shared';
import { scrubMessage } from '../translations/log';

/**
 * Headers every `/api` response carries. SWA's `globalHeaders` do not apply to
 * API responses, so the API sets `X-Robots-Tag` itself.
 */
export const API_HEADERS = { 'x-robots-tag': 'noindex' } as const;

/**
 * An `HttpResponse` instance (rather than a plain `HttpResponseInit`). Duck-typed:
 * `@azure/functions` is CommonJS, so the ESM bundle can import `app` from it but
 * not the `HttpResponse` class (Node's named-export detection misses it).
 */
const isHttpResponse = (result: HttpResponseInit | HttpResponse): result is HttpResponse =>
  typeof (result as Partial<HttpResponse>).arrayBuffer === 'function' && result.headers instanceof Headers;

/** Adds `API_HEADERS` to an HTTP handler's result (an `HttpResponseInit` or `HttpResponse`). */
export function withApiHeaders(result: HttpResponseInit | HttpResponse): HttpResponseInit | HttpResponse {
  if (isHttpResponse(result)) {
    for (const [name, value] of Object.entries(API_HEADERS)) result.headers.set(name, value);
    return result;
  }
  const headers = new Headers(result.headers);
  for (const [name, value] of Object.entries(API_HEADERS)) headers.set(name, value);
  return { ...result, headers };
}

const INTERNAL_ERROR: ApiErrorResponse = { error: 'internal' };

/**
 * Wraps every HTTP handler (in `index.ts`, and in the Seam 1 harness): the
 * result gets `API_HEADERS`, and an unexpected throw becomes a 500 with a
 * fixed body instead of the host's own 500, which would carry no headers.
 * The error is logged as `request.failed` with its message scrubbed.
 */
export function guardHttpHandler(handler: HttpHandler): HttpHandler {
  return async (request, context) => {
    try {
      return withApiHeaders((await handler(request, context)) ?? {});
    } catch (error) {
      context.error('request.failed', {
        errorName: error instanceof Error ? error.name : typeof error,
        message: scrubMessage(error instanceof Error ? error.message : String(error)),
      });
      return withApiHeaders({ status: 500, jsonBody: INTERNAL_ERROR });
    }
  };
}
