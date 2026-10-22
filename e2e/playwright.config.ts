import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// 127.0.0.1 everywhere: the server's same-origin websocket check compares Origin with Host.
const port = Number(process.env.E2E_PORT ?? 47831);
const baseURL = `http://127.0.0.1:${port}`;
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node apps/server/dist/main.js',
    cwd: repoRoot,
    env: {
      PORT: String(port),
      // In-memory store, single replica: allowed for tests and development only.
      RPS_DEV_MEMORY_STORE: '1',
    },
    url: `${baseURL}/readyz`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
