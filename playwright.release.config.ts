import { defineConfig, devices } from '@playwright/test';

// S18 release drill and measurements against already running deployments
// (ops/release-drill.sh, tests/release/compose.drill.yaml). Tests run against
// isolated synthetic deployments; no production data or setup secrets are used.
export default defineConfig({
  testDir: './tests/release',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 300_000,
  reporter: 'list',
  outputDir: 'test-results/release',
  use: {
    ignoreHTTPSErrors: true, // Local drill uses Caddy's internal CA only.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
