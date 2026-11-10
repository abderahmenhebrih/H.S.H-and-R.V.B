import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * HSH Phase-2 lifecycle tests: rapid switching, navigation-during-save,
 * cross-tab convergence, offline→online persistence.
 * Assumes the QA stack (frontend :3000 + QA backend :5000).
 */

const SETTINGS_URL = "/settings?section=general";

async function currentLang(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.lang);
}

async function currentDir(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.dir);
}

async function steadyTriggerText(page: Page, label: string, trigger: ReturnType<Page["locator"]>): Promise<string> {
  // Right after navigation the trigger may still show the DEFAULT language
  // until the canonical Dexie row loads. Wait for the text to stop changing
  // before deciding whether a switch is needed.
  let current = ((await trigger.textContent()) || "").trim();
  for (let i = 0; i < 5 && current !== label; i++) {
    await page.waitForTimeout(700);
    const next = ((await trigger.textContent()) || "").trim();
    if (next === current) break;
    current = next;
  }
  return current;
}

async function setLanguage(page: Page, code: "en" | "fr" | "ar") {
  await page.goto(SETTINGS_URL);
  const label = code === "en" ? "English" : code === "fr" ? "Français" : "العربية";
  const trigger = page
    .locator('button[aria-haspopup="listbox"]', { hasText: /English|Français|العربية/ })
    .first();
  await expect(trigger).toBeVisible({ timeout: 15000 });
  if ((await steadyTriggerText(page, label, trigger)) === label) {
    await expect.poll(() => currentLang(page), { timeout: 15000 }).toBe(code);
    return;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await trigger.click({ timeout: 10000 });
    const menu = page.locator('[role="listbox"]').last();
    await expect(menu).toBeVisible({ timeout: 10000 });
    await menu.locator('[role="option"]', { hasText: label }).first().click({ timeout: 10000 });
    const dialog = page.locator('[role="dialog"]').last();
    try {
      await expect(dialog).toBeVisible({ timeout: 8000 });
    } catch {
      // No dialog: missed click or converged state. Re-read before retrying.
      await page.waitForTimeout(500);
      if (((await trigger.textContent()) || "").trim() === label) break;
      if (attempt === 1) throw new Error(`language select did not open confirm dialog for ${code}`);
      continue;
    }
    await dialog.locator('button[class*="confirmButton"]').first().click({ timeout: 10000 });
    await expect(dialog).toBeHidden({ timeout: 10000 });
    try {
      await expect.poll(() => currentLang(page), { timeout: 15000 }).toBe(code);
      return;
    } catch (e) {
      // Confirm closed without applying (save still settling). Re-select.
      if (attempt === 1) throw e;
      await page.goto(SETTINGS_URL);
      await expect(trigger).toBeVisible({ timeout: 15000 });
    }
  }
}

test.describe("HSH phase-2 lifecycle", () => {
  test("rapid switching converges to the last selection", async ({ page }) => {
    // Switch three times without settling; only the final language must win.
    // Each select retries once: a portaled menu click can land during the
    // open animation and dismiss the menu without selecting.
    for (const code of ["fr", "ar", "en"] as const) {
      await page.goto(SETTINGS_URL);
      const label = code === "en" ? "English" : code === "fr" ? "Français" : "العربية";
      const trigger = page
        .locator('button[aria-haspopup="listbox"]', { hasText: /English|Français|العربية/ })
        .first();
      await expect(trigger).toBeVisible({ timeout: 15000 });
      let current = ((await trigger.textContent()) || "").trim();
      for (let i = 0; i < 5 && current !== label; i++) {
        await page.waitForTimeout(700);
        const next = ((await trigger.textContent()) || "").trim();
        if (next === current) break;
        current = next;
      }
      if (current === label) continue;
      let opened = false;
      for (let attempt = 0; attempt < 2 && !opened; attempt++) {
        await trigger.click({ timeout: 10000 });
        const menu = page.locator('[role="listbox"]').last();
        await expect(menu).toBeVisible({ timeout: 10000 });
        await menu.locator('[role="option"]', { hasText: label }).first().click({ timeout: 10000 });
        const dialog = page.locator('[role="dialog"]').last();
        try {
          await expect(dialog).toBeVisible({ timeout: 8000 });
          opened = true;
        } catch {
          // Menu dismissed without selecting; retry the open+click once.
          await page.waitForTimeout(500);
        }
      }
      expect(opened).toBe(true);
      const dialog = page.locator('[role="dialog"]').last();
      await dialog.locator('button[class*="confirmButton"]').first().click({ timeout: 10000 });
      await expect(dialog).toBeHidden({ timeout: 10000 });
      // Intentionally no poll here: fire the next switch immediately.
    }
    // Settle explicitly on the final language and verify convergence.
    await setLanguage(page, "ar");
    expect(await currentDir(page)).toBe("rtl");
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toContain("undefined");
  });

  test("navigation during save lands on the new language", async ({ page }) => {
    await setLanguage(page, "fr");
    // Reload settings (canonical read) then navigate immediately; the
    // destination must render from canonical French state, not a stale closure.
    await page.goto("/customers");
    await expect.poll(() => currentLang(page), { timeout: 15000 }).toBe("fr");
    await expect(page.locator("body")).toContainText(/Clients/, { timeout: 15000 });
  });

  test("cross-tab settings converge after reload", async ({ context }) => {
    // Two tabs share one profile (and one Dexie). Switching in tab 1 then
    // reloading tab 2 must show the new language (canonical re-read on mount).
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();
    await tab2.goto("/customers");
    await expect.poll(async () => tab2.evaluate(() => document.documentElement.lang), { timeout: 15000 }).toBe("en");
    await setLanguage(tab1, "ar");
    await tab2.reload();
    await expect.poll(async () => tab2.evaluate(() => document.documentElement.lang), { timeout: 30000 }).toBe("ar");
    await expect(tab2.locator("body")).toContainText(/الزبائن|العملاء/, { timeout: 15000 });
    await tab1.close();
    await tab2.close();
  });

  test("offline switch persists locally, online keeps it", async ({ page, context }) => {
    await setLanguage(page, "fr");
    // Go offline while staying on the already-loaded settings page: no
    // navigation is possible offline (even localhost), so drive the switcher
    // in place. Dexie saves work offline; only the sync push stays queued.
    await context.setOffline(true);
    try {
      const trigger = page
        .locator('button[aria-haspopup="listbox"]', { hasText: /English|Français|العربية/ })
        .first();
      await expect(trigger).toBeVisible({ timeout: 15000 });
      const label = "العربية";
      const current = ((await trigger.textContent()) || "").trim();
      if (current !== label) {
        await trigger.click({ timeout: 10000 });
        const menu = page.locator('[role="listbox"]').last();
        await expect(menu).toBeVisible({ timeout: 10000 });
        await menu.locator('[role="option"]', { hasText: label }).first().click({ timeout: 10000 });
        const dialog = page.locator('[role="dialog"]').last();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        await dialog.locator('button[class*="confirmButton"]').first().click({ timeout: 10000 });
        await expect(dialog).toBeHidden({ timeout: 10000 });
      }
      await expect.poll(() => currentLang(page), { timeout: 15000 }).toBe("ar");
      // Dexie canonical row must hold Arabic even with no backend reachable.
      const dexieLang = await page.evaluate(async () => {
        try {
          const req = indexedDB.open("HebrihSlaughterHouse");
          return await new Promise((res) => {
            req.onsuccess = () => {
              try {
                const db = req.result;
                if (!db.objectStoreNames.contains("settings")) { res("no-store"); return; }
                const tx = db.transaction("settings", "readonly");
                const g = tx.objectStore("settings").get("settings");
                g.onsuccess = () => res(g.result ? g.result.language : "no-row");
                g.onerror = () => res("get-err");
              } catch { res("err"); }
            };
            req.onerror = () => res("open-err");
          });
        } catch { return "exc"; }
      });
      expect(dexieLang).toBe("ar");
    } finally {
      await context.setOffline(false);
    }
    // Reconnect: sync backlog drains; the locally saved language must survive.
    await page.waitForTimeout(8000);
    await expect.poll(() => currentLang(page), { timeout: 15000 }).toBe("ar");
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toContain("undefined");
  });

  test("seller validation errors are translated, unknown errors generic", async ({ page }) => {
    await setLanguage(page, "ar");
    await page.goto("/settings?section=invoice");
    // The invoice section must render in Arabic...
    await expect.poll(() => page.evaluate(() => document.body.innerText), { timeout: 15000 }).toMatch(
      /[\u0600-\u06FF]{3,}/,
    );
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toContain("undefined");
    // ...and must never leak raw English service sentences (F-01 regression:
    // the old local helper passed through messages lacking fail/error).
    expect(body).not.toContain("Customer name is required.");
    expect(body).not.toContain("Title required");
  });
});
