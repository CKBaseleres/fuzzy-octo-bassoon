import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Compiling Bicep spawns the CLI, which takes a few seconds per file.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
