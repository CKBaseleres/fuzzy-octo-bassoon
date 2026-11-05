import { defineConfig, devices } from '@playwright/test';

/**
 * Browser accessibility gate (ticket 12): the real built SPA (`vite preview` of
 * `web/dist`) in Chromium, with `/api` and Blob Storage faked at the network
 * layer (`fakeApi.ts`). Run with `npm run test:a11y` (it builds first).
 */
const PORT = 4173;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]] : 'list',
  outputDir: '../test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    cwd: '..',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
