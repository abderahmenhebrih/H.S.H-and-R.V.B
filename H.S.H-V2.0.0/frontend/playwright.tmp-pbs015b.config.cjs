const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  testMatch: ["**/tmp-pbs015b.spec.ts"],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
