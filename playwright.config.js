// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Project test framework (ADR-2026-06-11: see architecture.md "Test Strategy").
// One suite covers both pure-node checks (tailwind tokens, class coverage) and
// real-browser checks (a11y audit, vmode FSM) — the SPA is a monolithic
// index.html that only a real browser can boot, so jsdom-based runners don't
// fit. A loopback static server (webServer below) gives specs a real origin.

const PORT = 5050;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node tests/support/serve.js',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    env: { A11Y_PORT: String(PORT) },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
