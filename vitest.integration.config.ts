import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    maxWorkers: 1,
    testTimeout: 15000,
  },
});
