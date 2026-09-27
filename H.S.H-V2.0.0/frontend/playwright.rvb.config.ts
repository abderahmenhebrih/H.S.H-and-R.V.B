import { defineConfig, devices } from "@playwright/test";

/** Isolated R.V.B Phase 1 real-browser acceptance environment. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "rvb-desktop-phase1.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: "http://localhost:3001",
    trace: "off",
    screenshot: "off",
    video: "off",
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
        RVB_JWT_ACCESS_SECRET: "rvb-phase1-qa-access-secret-only",
        RVB_JWT_REFRESH_SECRET: "rvb-phase1-qa-refresh-secret-only",
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
