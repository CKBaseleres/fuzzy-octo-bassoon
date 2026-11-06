import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import type { ApiErrorResponse } from '@lingo-lens/shared';

export const badRequest = (message: string): HttpResponseInit => ({
  status: 400,
  jsonBody: { error: 'badRequest', message } satisfies ApiErrorResponse,
});

export const notFound = (): HttpResponseInit => ({
  status: 404,
  jsonBody: { error: 'notFound' } satisfies ApiErrorResponse,
});

/** The JSON body as an untyped record, or undefined when it is missing or not an object. */
export async function readJsonObject(request: HttpRequest): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lower-cases a string extension; undefined when it is not a string. */
export const normaliseExtension = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : undefined);
