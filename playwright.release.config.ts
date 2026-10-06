import { defineConfig, devices } from '@playwright/test';

// S18 release drill and measurements against already running deployments
// (see ops/DEPLOYMENT.md "Release drill"). It starts nothing and owns no data:
// the operator supplies URLs/tokens through the environment.
export default defineConfig({
  testDir: './tests/release',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 300_000,
  reporter: 'list',
  use: {
    ignoreHTTPSErrors: true, // Local drill uses Caddy's internal CA only.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
