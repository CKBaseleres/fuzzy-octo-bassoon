import type { HealthResponse } from '@lingo-lens/shared';

/** Thin typed wrappers over `/api`. Responses are typed by the `shared` contract. */
async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${path} responded ${response.status}`);
  return (await response.json()) as T;
}

export const getHealth = () => getJson<HealthResponse>('/api/health');
