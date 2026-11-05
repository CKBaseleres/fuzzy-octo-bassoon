import type { HealthResponse } from '@lingo-lens/shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

/**
 * Seam 2 harness: the network boundary of the SPA. Started in `setup.ts` with
 * no handlers, so every test arranges exactly the `/api` responses it needs
 * through `mockApi`, typed by the `shared` contract.
 *
 * Growing it: add one helper per endpoint here, typed with its `shared`
 * response type. Tests that need to inspect requests can call `server.use`
 * with their own handler or listen to `server.events`.
 */
export const server = setupServer();

export const mockApi = {
  health(body: HealthResponse, init?: ResponseInit) {
    server.use(http.get<never, never, HealthResponse>('/api/health', () => HttpResponse.json(body, init)));
  },
  healthFails(status: number) {
    server.use(http.get('/api/health', () => new HttpResponse(null, { status })));
  },
};
