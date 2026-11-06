/**
 * An endpoint app setting as a URL. Adapters call this on first use, never at
 * module load: a missing or malformed setting fails the request that needs it
 * with a clear error (a safe 500, logged as `request.failed`), and the host
 * still starts, so `/api/health` keeps answering.
 */
export function endpointUrl(setting: string, value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`App setting ${setting} is missing or not a URL`);
  }
}

/** Creates a value on first use and reuses it after. */
export function onFirstUse<T>(create: () => T): () => T {
  let value: { current: T } | undefined;
  return () => (value ??= { current: create() }).current;
}
