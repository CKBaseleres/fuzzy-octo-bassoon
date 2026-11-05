import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { server } from './mockApi';

// jsdom has no object URLs; give them a body so tests can spy on them (see saves.ts).
if (!('createObjectURL' in URL)) Object.assign(URL, { createObjectURL: () => 'blob:unstubbed' });
if (!('revokeObjectURL' in URL)) Object.assign(URL, { revokeObjectURL: () => undefined });

// jsdom has no ResizeObserver; Fluent's MessageBar needs one to mount.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Any /api call a test did not arrange is a test bug, so fail loudly.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});
afterAll(() => server.close());
