import type { HealthResponse } from '@lingo-lens/shared';
import type { HttpHandlerFactory } from '../deps';

export const createHealthHandler: HttpHandlerFactory =
  ({ clock }) =>
  () => {
    const body: HealthResponse = { status: 'ok', time: clock.now().toISOString() };
    return { status: 200, jsonBody: body };
  };
