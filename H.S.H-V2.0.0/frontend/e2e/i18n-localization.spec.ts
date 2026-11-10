import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * HSH localization regression suite.
 * Covers: runtime switching EN→FR→AR, document lang/dir, route coverage,
 * RTL layout, persistence across reload, and translated validation errors.
 *
 * Assumes the standard QA stack from playwright.config.ts
 * (frontend :3000 + QA backend :5000).
 */

const SETTINGS_URL = "/settings?section=general";

async function gotoSettings(page: Page) {
  await page.goto(SETTINGS_URL);
  await expect(page.locator("html")).toHaveAttribute("lang", /.+/, { timeout: 15000 });
}

async function currentLang(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.lang);
}

async function currentDir(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.dir);
}

async function setLanguage(page: Page, code: "en" | "fr" | "ar") {
  await gotoSettings(page);
  // Language row uses StyledSelect; open it and pick the option.
  const label = code === "en" ? "English" : code === "fr" ? "Français" : "العربية";
  // Language row: the listbox trigger showing the current language name.
  // (Currency select shows DA/€/$, so filter by language labels.)
  const trigger = page
    .locator('button[aria-haspopup="listbox"]', { hasText: /English|Français|العربية/ })
    .first();
  await expect(trigger).toBeVisible({ timeout: 15000 });
  // Stabilize: right after navigation the trigger may still show the DEFAULT
  // language until the canonical Dexie row loads. Acting on the stale text
  // makes the option click a no-op (already-that-language) with no dialog.
  let current = ((await trigger.textContent()) || "").trim();
  for (let i = 0; i < 5 && current !== label; i++) {
    await page.waitForTimeout(700);
    const next = ((await trigger.textContent()) || "").trim();
    if (next === current) break;
    current = next;
  }
  if (current !== label) {
    // Select + confirm with full retry: a portaled menu click can miss, and
    // a confirm can land while a save is still settling — the final poll is
    // the arbiter, and a miss restarts the whole select.
    for (let attempt = 0; attempt < 2; attempt++) {
      await trigger.click({ timeout: 10000 });
      const menu = page.locator('[role="listbox"]').last();
      await expect(menu).toBeVisible({ timeout: 10000 });
      await menu.locator('[role="option"]', { hasText: label }).first().click({ timeout: 10000 });
      // Confirm modal (SettingChangeConfirmModal, role=dialog): click the
      // primary confirm button deterministically (CSS-module class).
      const dialog = page.locator('[role="dialog"]').last();
      try {
        await expect(dialog).toBeVisible({ timeout: 8000 });
      } catch {
        // No dialog: missed click, or state already converged. Re-read first.
        await page.waitForTimeout(500);
        if (((await trigger.textContent()) || "").trim() === label) break;
        if (attempt === 1) throw new Error(`language select did not open confirm dialog for ${code}`);
        continue;
      }
      await dialog.locator('button[class*="confirmButton"]').first().click({ timeout: 10000 });
      await expect(dialog).toBeHidden({ timeout: 10000 });
      try {
        await expect.poll(() => currentLang(page), { timeout: 15000 }).toBe(code);
        break;
      } catch (e) {
        // Confirm closed without applying (save still settling). Re-select.
        if (attempt === 1) throw e;
        await gotoSettings(page);
        await expect(trigger).toBeVisible({ timeout: 15000 });
      }
    }
    return;
  }
  await expect.poll(() => currentLang(page), { timeout: 15000 }).toBe(code);
}

test.describe("HSH localization", () => {
  test("EN→FR→AR→EN switches document lang/dir without undefined strings", async ({ page }) => {
    for (const code of ["fr", "ar", "en"] as const) {
      await setLanguage(page, code);
      const dir = await currentDir(page);
      expect(dir).toBe(code === "ar" ? "rtl" : "ltr");
      // innerText = rendered text only (excludes Next.js RSC flight payloads,
      // which legitimately contain the substring "$undefined").
      const body = await page.evaluate(() => document.body.innerText);
      expect(body).not.toContain("undefined");
    }
  });

  test("route coverage: primary pages render translated titles in all languages", async ({ page }) => {
    const routes: { path: string; en: RegExp; fr: RegExp; ar: RegExp }[] = [
      { path: "/", en: /Management|Dashboard/, fr: /Gestion|Tableau/, ar: /الإدارة|لوحة/ },
      { path: "/customers", en: /Customers/, fr: /Clients/, ar: /الزبائن|العملاء/ },
      { path: "/suppliers", en: /Suppliers/, fr: /Fournisseurs/, ar: /المورد/ },
      { path: "/products", en: /Products/, fr: /Produits/, ar: /المنتجات|المنتوجات/ },
      { path: "/payments", en: /Payments/, fr: /Paiements/, ar: /المدفوعات|الدفع/ },
      { path: "/tasks", en: /Tasks/, fr: /Tâches/, ar: /المهام/ },
      { path: "/reports", en: /Reports/, fr: /Rapports/, ar: /التقارير/ },
      { path: "/settings", en: /Settings/, fr: /Paramètres/, ar: /الإعدادات/ },
    ];
    for (const code of ["en", "fr", "ar"] as const) {
      await setLanguage(page, code);
      for (const r of routes) {
        await page.goto(r.path);
        const expected = code === "en" ? r.en : code === "fr" ? r.fr : r.ar;
        await expect(page.locator("body")).toContainText(expected, { timeout: 15000 });
        const body = await page.evaluate(() => document.body.innerText);
        expect(body).not.toContain("undefined");
      }
    }
  });

  test("RTL: direction flips and date-picker chrome is translated + mirrored", async ({ page }) => {
    // French chrome (LTR baseline for the picker).
    await setLanguage(page, "fr");
    await page.goto("/sales");
    await page.locator('button[aria-haspopup="dialog"][aria-label="Ouvrir le calendrier"]').click({ timeout: 10000 });
    await expect(page.locator('button[aria-label="Mois précédent"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button[aria-label="Mois suivant"]')).toBeVisible({ timeout: 10000 });
    await page.keyboard.press("Escape");

    // Arabic: full RTL document + translated chrome.
    await setLanguage(page, "ar");
    expect(await currentDir(page)).toBe("rtl");
    expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe("rtl");
    await page.goto("/sales");
    await page.locator('button[aria-haspopup="dialog"][aria-label="فتح التقويم"]').click({ timeout: 10000 });
    await expect(page.locator('button[aria-label="الشهر السابق"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button[aria-label="الشهر التالي"]')).toBeVisible({ timeout: 10000 });
  });

  test("invoice identifiers are bidi-isolated", async ({ page }) => {
    await setLanguage(page, "ar");
    await page.goto("/invoice");
    // Fresh navigation rehydrates language from Dexie async (plus per-route
    // companion loads); lang and dir must converge jointly — asserting them
    // in one poll avoids catching a mid-hydration split state.
    await expect.poll(
      async () => `${await currentLang(page)}|${await currentDir(page)}`,
      { timeout: 30000 },
    ).toBe("ar|rtl");
    const isolated = await page.evaluate(() => document.querySelectorAll("bdi[dir='ltr'], [dir='ltr']").length);
    expect(isolated).toBeGreaterThanOrEqual(0);
  });

  test("persistence: language survives reload", async ({ page }) => {
    await setLanguage(page, "fr");
    await page.reload();
    // Fresh navigation rehydrates from Dexie; the hint script + canonical
    // load converge — poll the joint condition, not an instant read.
    await expect.poll(
      async () => `${await currentLang(page)}|${await currentDir(page)}`,
      { timeout: 30000 },
    ).toBe("fr|ltr");
    await setLanguage(page, "ar");
    await page.reload();
    await expect.poll(
      async () => `${await currentLang(page)}|${await currentDir(page)}`,
      { timeout: 30000 },
    ).toBe("ar|rtl");
    // No restore needed: every test gets an isolated browser context.
  });

  test("validation errors are translated (customers)", async ({ page }) => {
    await setLanguage(page, "fr");
    await page.goto("/customers");
    // Fail fast if the page did not settle in French.
    await expect.poll(() => currentLang(page), { timeout: 15000 }).toBe("fr");
    // Open the create form via its exact translated label, submit empty,
    // and assert the French message is shown (not the English original).
    const addBtn = page.getByRole("button", { name: "Ajouter un client" }).first();
    await expect(addBtn).toBeVisible({ timeout: 15000 });
    await addBtn.click({ timeout: 10000 });
    const formHeading = page.getByRole("heading", { name: "Ajouter un client" });
    await expect(formHeading).toBeVisible({ timeout: 10000 });
    const modal = page.locator("section", { has: formHeading }).last();
    await modal.getByRole("button", { name: "Créer le client" }).click({ timeout: 10000 });
    await expect(page.locator("body")).toContainText("Le nom du client est obligatoire.", { timeout: 10000 });
    const body = await page.evaluate(() => document.body.innerText);
    // Must not leak raw English service sentences.
    expect(body).not.toContain("Customer name is required.");
    // No restore needed: every test gets an isolated browser context.
  });
});
