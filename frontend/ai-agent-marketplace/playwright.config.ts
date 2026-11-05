import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the AI Agent Marketplace frontend.
 *
 * The project's Vite dev server defaults to port 3000 (see vite.config.ts),
 * but issue #18 requires the tests to target http://localhost:5173. The
 * `webServer` below starts Vite on 5173 with `--strictPort` so the base URL is
 * deterministic, and Playwright waits for the server to respond before running.
 *
 * Run locally with `pnpm test:e2e`; in CI the browsers are installed by the
 * `frontend-e2e` job in .github/workflows/ci-cd.yml.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
