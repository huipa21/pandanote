import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  globalTeardown: './tests/e2e/teardown.ts',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `"${process.execPath}" scripts/e2e-server.mjs`,
      url: 'http://127.0.0.1:4173/health',
      reuseExistingServer: false,
    },
    {
      command: `"${process.execPath}" node_modules/vite/bin/vite.js --config tests/browser/vite.config.ts --host 127.0.0.1 --port 4174 --strictPort`,
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
