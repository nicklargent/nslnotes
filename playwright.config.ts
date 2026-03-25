import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E test configuration (T7.9).
 * Tests run against the Vite dev server.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: process.env["PLAYWRIGHT_CHROMIUM_PATH"] || undefined,
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev:web",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env["CI"],
    timeout: 10000,
  },
});
