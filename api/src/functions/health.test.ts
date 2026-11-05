import type { HealthResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { createTestApi } from '../testing/testApi';
import { createHealthHandler } from './health';

describe('GET /api/health', () => {
  it('reports ok with the current time from the injected clock', async () => {
    const api = createTestApi({ now: '2026-11-05T09:30:00.000Z' });

    const response = await api.call(createHealthHandler, { method: 'GET', path: '/api/health' });

    expect(response.status).toBe(200);
    expect(response.json<HealthResponse>()).toEqual({
      status: 'ok',
      time: '2026-11-05T09:30:00.000Z',
    });
  });
});
