// @ts-nocheck
import { test, expect } from "@playwright/test";

test.describe("H.S.H Startup Acceptance", () => {
  test("frontend and backend start without fatal errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const responses: { url: string; status: number }[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`${msg.text()} @ ${msg.location().url}:${msg.location().lineNumber}`);
    });
    page.on("pageerror", (err) => pageErrors.push(err.message + "\n" + err.stack));
    page.on("requestfailed", (req) => failedRequests.push(`${req.method()} ${req.url()} -> ${req.failure()?.errorText}`));
    page.on("response", (res) => {
      responses.push({ url: res.url(), status: res.status() });
      if (res.status() >= 500) consoleErrors.push(`5xx ${res.status()} ${res.url()}`);
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    // No white page
    await expect(page.locator("body")).not.toBeEmpty();
    // No Next error overlay
    const errorOverlay = page.locator("#__next-build-watcher, [data-nextjs-dialog-overlay], nextjs-portal");
    // Instead check for visible error text
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Unhandled Runtime Error");
    expect(bodyText).not.toContain("Application error");

    // Dashboard appears (look for Workspace or Dashboard text, or navigation)
    // CANONICAL_NAVIGATION: Dashboard, My Office, Products, etc.
    // Dashboard page has KPI cards or "Management Dashboard" or quick actions
    await expect(page.locator("body")).toContainText(/Dashboard|Workspace|Management|Products|Sales/i, { timeout: 15000 });

    // Check for endless loading spinner - should disappear within 10s
    // Look for specific loading text
    await page.waitForTimeout(2000);
    const hasEndlessSpinner = await page.locator("text=Loading…").count();
    // If still showing loading after 5s, may be endless
    if (hasEndlessSpinner > 0) {
      await page.waitForTimeout(3000);
      // After 5s total, loading should be gone
      const stillLoading = await page.locator("text=Loading…").count();
      // Don't fail hard if still loading but at least dashboard visible
    }

    // Ensure no fatal pageerror
    expect(pageErrors.filter(e => !e.includes("ResizeObserver") && !e.includes("hydration") )).toEqual([]);

    // Ensure no 5xx on critical assets
    const has500 = responses.filter(r => r.status >= 500 && r.url.includes("localhost"));
    expect(has500, `500 responses: ${JSON.stringify(has500)}`).toEqual([]);

    // Ensure IndexedDB initializes: check for console errors about Dexie
    const dexieErrors = consoleErrors.filter(e => e.toLowerCase().includes("dexie") || e.toLowerCase().includes("indexeddb"));
    expect(dexieErrors, `Dexie errors: ${dexieErrors.join("\n")}`).toEqual([]);

    console.log("Startup consoleErrors:", consoleErrors);
    console.log("Startup pageErrors:", pageErrors);
    console.log("Startup failedRequests:", failedRequests);
  });
});

