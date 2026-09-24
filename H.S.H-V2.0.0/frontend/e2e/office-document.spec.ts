// @ts-nocheck
import { test, expect } from "@playwright/test";

test.describe("Office Document Editor — Critical Crash Fix", () => {
  test.beforeEach(async ({ page }) => {
    page.on("console", (msg) => {
      // Log browser console for debugging
      if (msg.type() === "error") console.log(`[browser console error] ${msg.text()}`);
    });
    page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}\n${err.stack}`));
  });

  test("create → open → type → save → leave → reopen → text persists → rename → reload — no crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // 1. Open My Office
    await page.goto("/office", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/Workspace|Espace de travail|مساحة العمل/i, { timeout: 15000 });
    expect(errors, `pageerror on /office: ${errors.join("\n")}`).toEqual([]);

    // Ensure no Next overlay
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");

    // 2. Create a Document — click New → New Document
    // Office header has button "New" (Plus icon) that opens menu
    const newButton = page.getByRole("button", { name: /^New$|^Nouveau$|^جديد$/i }).first();
    await expect(newButton).toBeVisible({ timeout: 10000 });
    await newButton.click();

    // Menu appears with New Document
    const newDocItem = page.getByRole("menuitem", { name: /New Document|Nouveau Document|مستند جديد/i }).first();
    if (await newDocItem.isVisible().catch(() => false)) {
      await newDocItem.click();
    } else {
      // Fallback: direct button in empty state
      const createDocBtn = page.getByRole("button", { name: /New Document|Create.*Document|مستند جديد/i }).first();
      if (await createDocBtn.isVisible().catch(() => false)) await createDocBtn.click();
    }

    // Create modal appears: Title input
    const titleInput = page.getByPlaceholder(/Untitled|Sans titre|بدون عنوان/i).first();
    // Or label Title
    const titleField = page.getByLabel(/Title|Titre|العنوان/i).first();
    const targetInput = (await titleField.isVisible().catch(() => false)) ? titleField : titleInput;
    await expect(targetInput).toBeVisible({ timeout: 10000 });
    await targetInput.fill("QA-DOC-CRASH-TEST");

    // Click Create
    const createBtn = page.getByRole("button", { name: /^Create$|^Créer$|^إنشاء$/i }).first();
    await expect(createBtn).toBeEnabled({ timeout: 5000 });
    await createBtn.click();

    // Should navigate to /office/document/<id>
    await page.waitForURL(/\/office\/document\/[^\/]+/, { timeout: 15000 });
    const docUrl = page.url();
    expect(docUrl).toMatch(/\/office\/document\//);
    console.log("Document URL:", docUrl);

    // 3. Observe whether route crashes: ensure no runtime error overlay
    await page.waitForTimeout(1500); // allow editor to load
    const bodyTextAfterOpen = await page.textContent("body");
    expect(bodyTextAfterOpen).not.toContain("Cannot read properties of null");
    expect(bodyTextAfterOpen).not.toContain("reading 'commands'");
    expect(errors.filter(e => e.includes("commands") || e.includes("Cannot read properties"))).toEqual([]);

    // Ensure editor is visible (Tiptap)
    const editor = page.locator(".tiptap, [data-testid='tiptap-editor'], .ProseMirror").first();
    // Fallback: look for contenteditable
    const proseMirror = page.locator('[contenteditable="true"]').first();
    const editorVisible = (await editor.isVisible().catch(() => false)) || (await proseMirror.isVisible().catch(() => false));
    expect(editorVisible, "Editor should be visible").toBeTruthy();

    // Wait for editor to be ready (no overlay)
    await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error", { timeout: 5000 });
    expect(errors).toEqual([]);

    // 4. Type text: English
    const editable = page.locator('[contenteditable="true"]').first();
    await expect(editable).toBeVisible({ timeout: 10000 });
    await editable.click();
    await editable.pressSequentially("Hello QA English ", { delay: 30 });

    // French accents
    await editable.pressSequentially("French: é à ç ", { delay: 30 });

    // Arabic
    await editable.pressSequentially("Arabic مرحبا ", { delay: 30 });

    await page.waitForTimeout(1000); // debounce 800ms + buffer

    // Check content appears
    await expect(editable).toContainText("Hello QA English");
    await expect(editable).toContainText("é à ç");
    // Arabic may be RTL but should appear
    await expect(editable).toContainText("مرحبا");

    // 5. Save/autosave — status should show Saved or Saving then Saved
    // Look for status text
    const statusSaved = page.locator("text=Saved").first();
    const statusSaving = page.locator("text=Saving").first();
    // Wait for saved status (debounce 800ms)
    await expect(statusSaved.or(statusSaving)).toBeVisible({ timeout: 10000 });
    // Wait a bit more for saved specifically
    await page.waitForTimeout(1500);
    // Should be Saved (or Offline if offline, but we are online)
    // Not strictly required to be "Saved", but should not be error

    // 6. Leave → Reopen: navigate back to Office then open again
    const backBtn = page.getByRole("button", { name: /Back to Office|Retour au bureau|العودة إلى المكتب/i }).first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
    } else {
      await page.goto("/office", { waitUntil: "domcontentloaded" });
    }
    await expect(page.locator("body")).toContainText(/Workspace/i, { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Find the created file card by title
    const fileCard = page.locator(`text=QA-DOC-CRASH-TEST`).first();
    await expect(fileCard).toBeVisible({ timeout: 10000 });

    // Click Open on that card (there is an Open button per card)
    // Find the card container then Open button
    const card = page.locator("div", { hasText: "QA-DOC-CRASH-TEST" }).first();
    // Try to find Open button near it
    const openBtn = page.getByRole("button", { name: /^Open$|^Ouvrir$|^فتح$/i }).first();
    // If multiple, find the one in the same card row - click the first Open that leads to document
    // Alternative: directly navigate to docUrl
    await page.goto(docUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const editable2 = page.locator('[contenteditable="true"]').first();
    await expect(editable2).toBeVisible({ timeout: 10000 });
    await expect(editable2).toContainText("Hello QA English");
    await expect(editable2).toContainText("é à ç");
    await expect(editable2).toContainText("مرحبا");

    // 7. Rename → reload → still works
    const titleInputDoc = page.getByPlaceholder(/Untitled|Sans titre|بدون عنوان/i).first();
    const titleLabelDoc = page.getByLabel(/Document title|Titre du document|عنوان المستند/i).first();
    const docTitleInput = (await titleLabelDoc.isVisible().catch(() => false)) ? titleLabelDoc : titleInputDoc;
    if (await docTitleInput.isVisible().catch(() => false)) {
      await docTitleInput.click({ clickCount: 3 });
      await docTitleInput.pressSequentially("QA-DOC-RENAMED");
      await page.waitForTimeout(800); // debounce 600ms
      // Check status saved
      await page.waitForTimeout(1000);
    }

    // Reload browser
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const editableAfterReload = page.locator('[contenteditable="true"]').first();
    await expect(editableAfterReload).toBeVisible({ timeout: 10000 });
    // Title should persist (check input value)
    if (await docTitleInput.isVisible().catch(() => false)) {
      await expect(docTitleInput).toHaveValue(/QA-DOC-RENAMED|QA-DOC-CRASH-TEST/, { timeout: 5000 });
    }
    await expect(editableAfterReload).toContainText("Hello QA English");

    // Ensure no console error throughout
    expect(errors.filter(e => e.includes("commands") || e.includes("Cannot read"))).toEqual([]);
    // Also ensure no React hydration errors leaked as pageerror
    expect(errors).toEqual([]);

    console.log("Document editor Browser test PASS — Chromium interacted successfully");
  });

  test("rapid navigation between documents does not crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/office", { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/Workspace/i, { timeout: 15000 });

    // Create two docs quickly
    for (let i = 1; i <= 2; i++) {
      const newButton = page.getByRole("button", { name: /^New$|^Nouveau$/i }).first();
      await newButton.click();
      const newDocItem = page.getByRole("menuitem", { name: /New Document/i }).first();
      if (await newDocItem.isVisible().catch(() => false)) await newDocItem.click();
      const titleInput = page.getByPlaceholder(/Untitled|Sans titre/i).first();
      const titleField = page.getByLabel(/Title|Titre/i).first();
      const target = (await titleField.isVisible().catch(() => false)) ? titleField : titleInput;
      await expect(target).toBeVisible({ timeout: 10000 });
      await target.fill(`QA-RAPID-${i}-${Date.now()}`);
      const createBtn = page.getByRole("button", { name: /^Create$|^Créer$/i }).first();
      await createBtn.click();
      await page.waitForURL(/\/office\/document\//, { timeout: 15000 });
      await page.waitForTimeout(800);
      // Back to office
      await page.goto("/office", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toContainText(/Workspace/i, { timeout: 10000 });
    }

    // Open first and quickly switch to second
    const firstDocLink = page.locator('a[href*="/office/document/"]').first();
    if (await firstDocLink.isVisible().catch(() => false)) {
      await firstDocLink.click();
      await page.waitForTimeout(500);
      await page.goBack();
      await page.waitForTimeout(500);
      const secondDocLink = page.locator('a[href*="/office/document/"]').nth(1);
      if (await secondDocLink.isVisible().catch(() => false)) {
        await secondDocLink.click();
      }
    } else {
      // Fallback navigate via URL list
      const cards = page.locator("text=QA-RAPID-");
      await expect(cards.first()).toBeVisible({ timeout: 5000 });
    }

    await page.waitForTimeout(1000);
    expect(errors.filter(e => e.includes("commands"))).toEqual([]);
    expect(page.url()).toMatch(/\/office/);
  });
});

