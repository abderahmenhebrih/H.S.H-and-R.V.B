import { defineConfig, devices } from "@playwright/test";

/**
 * H.S.H Real Browser Stabilization — Playwright config
 * - Browser is acceptance authority (Chromium)
 * - QA backend uses isolated MongoMemoryReplSet (backend/src/qa-server.ts)
 * - Frontend points to QA backend via default localhost:5000
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npx tsx src/qa-server.ts",
      cwd: "../backend",
      url: "http://localhost:5000/api/health",
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      // Increase memory for MongoMemory
      env: {
        ...process.env,
        PORT: "5000",
        NODE_ENV: "development",
        CORS_ORIGIN: "http://localhost:3000,http://localhost:8081",
        // Ephemeral per-run QA secrets: nothing sensitive is committed, and
        // tokens stay valid for the lifetime of this throwaway local stack.
        // NEVER put real production secrets here.
        RVB_JWT_ACCESS_SECRET: process.env.RVB_JWT_ACCESS_SECRET || require("crypto").randomBytes(48).toString("hex"),
        RVB_JWT_REFRESH_SECRET: process.env.RVB_JWT_REFRESH_SECRET || require("crypto").randomBytes(48).toString("hex"),
      } as any,
    },
    {
      command: "npm run dev",
      cwd: ".",
      url: "http://localhost:3000",
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: "http://localhost:5000",
        PORT: "3000",
      } as any,
    },
  ],
});


