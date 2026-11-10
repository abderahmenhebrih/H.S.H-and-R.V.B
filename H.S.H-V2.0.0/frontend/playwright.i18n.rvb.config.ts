import { defineConfig, devices } from "@playwright/test";

/**
 * QA-only RVB portal i18n config — mirrors playwright.rvb.config.ts (own
 * backend on :5001 with seeded QA accounts + frontend on :3001) but runs
 * the localization suite instead of the phase-1 suite.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "i18n-rvb-portal.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: "http://localhost:3001",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npx tsx src/rvb-qa-server.ts",
      cwd: "../backend",
      url: "http://localhost:5001/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        PORT: "5001",
        NODE_ENV: "development",
        SERVER_MODE: "full",
        QA_ISOLATED: "true",
        CORS_ORIGIN: "http://localhost:3001",
        RVB_QA_P1_PASSWORD: "Rvb-QA-P1!Base",
        // Prefer caller env; else ephemeral per-run values (see playwright.config.ts note).
        RVB_JWT_ACCESS_SECRET: process.env.RVB_JWT_ACCESS_SECRET || require("crypto").randomBytes(48).toString("hex"),
        RVB_JWT_REFRESH_SECRET: process.env.RVB_JWT_REFRESH_SECRET || require("crypto").randomBytes(48).toString("hex"),
      } as any,
    },
    {
      command: "npm run dev",
      cwd: ".",
      url: "http://localhost:3001",
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: "http://localhost:5001",
        PORT: "3001",
      } as any,
    },
  ],
});
