import { HttpResponse, type HttpResponseInit, type PostInvocationContext } from '@azure/functions';

/**
 * Headers every `/api` response carries. SWA's `globalHeaders` do not apply to
 * API responses, so the API sets `X-Robots-Tag` itself.
 */
export const API_HEADERS = { 'x-robots-tag': 'noindex' } as const;

/** Adds `API_HEADERS` to an HTTP handler's result (an `HttpResponseInit` or `HttpResponse`). */
export function withApiHeaders(result: HttpResponseInit | HttpResponse): HttpResponseInit | HttpResponse {
  if (result instanceof HttpResponse) {
    for (const [name, value] of Object.entries(API_HEADERS)) result.headers.set(name, value);
    return result;
  }
  const headers = new Headers(result.headers);
  for (const [name, value] of Object.entries(API_HEADERS)) headers.set(name, value);
  return { ...result, headers };
}

/** Registered in `index.ts` with `app.hook.postInvocation`, so every HTTP Function gets the headers. */
export function apiHeadersHook(context: PostInvocationContext): void {
  if (context.invocationContext.options.trigger.type !== 'httpTrigger') return;
  if (context.result !== null && typeof context.result === 'object') {
    context.result = withApiHeaders(context.result);
  }
}
