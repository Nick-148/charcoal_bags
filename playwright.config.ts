import { defineConfig, devices } from '@playwright/test';

const PORT = 4322;
const STATE_DIR = '.wrangler/e2e-state';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /storefront\.spec\.ts/ },
  ],
  webServer: {
    // Fresh in-memory-like D1 per run: wipe, migrate, then boot the dev server against it.
    command: `rm -rf ${STATE_DIR} && npx wrangler d1 migrations apply DB --local --persist-to ${STATE_DIR} && E2E_STATE_DIR=${STATE_DIR} npx astro dev --port ${PORT} --ignore-lock`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
