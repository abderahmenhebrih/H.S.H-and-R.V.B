import { defineConfig, devices } from "@playwright/test";

/**
 * QA-only i18n config — reuses already-running servers.
 * Start backend (`npx tsx src/qa-server.ts` in ../backend) and frontend
 * (`npm run dev` here) manually first; this config does NOT start webServers
 * so the mongodb-memory-server 10s instance-start timeout cannot abort the run.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "i18n-localization.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
