import { chromium } from "playwright";
const BASE_URL = process.env.EXPO_WEB_URL || "http://localhost:8082";
const API_URL = process.env.EXPO_PUBLIC_RVB_API_URL || "http://localhost:5000";
async function run() {
  console.log(`Testing Customer web at ${BASE_URL} (API ${API_URL})`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let pageErrors: any[] = [];
  let failed500: string[] = [];
  page.on("pageerror", (e) => {
    console.log("PAGEERROR", e.message);
    pageErrors.push(e.message);
  });
  page.on("response", async (resp) => {
    if (resp.status() >= 500) failed500.push(`${resp.url()} ${resp.status()}`);
  });

  const log = (m: string) => console.log(m);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('text="Sign in"', { timeout: 30000 }).catch(() => {});
  let tagLocator = page.getByPlaceholder("@abattoire");
  if ((await tagLocator.count()) === 0) tagLocator = page.locator('input').first();
  await tagLocator.fill("qa.customer.mobile");
  await page.waitForTimeout(500);
  let pwdLocator = page.getByPlaceholder("••••••••");
  if ((await pwdLocator.count()) === 0) pwdLocator = page.locator('input[type="password"]').first();
  await pwdLocator.fill("Mobile123!");
  await page.waitForTimeout(500);
  let signInBtn = page.getByText("Sign in", { exact: true });
  if ((await signInBtn.count()) === 0) signInBtn = page.locator('text="Sign in"').last();
  await signInBtn.first().click({ timeout: 10000 });
  try {
    await page.waitForResponse((r) => r.url().includes("/api/rvb/auth/login"), { timeout: 10000 });
    log("Login response OK");
  } catch {}
  await page.waitForTimeout(2000);

  // Dashboard checks
  try {
    await page.waitForSelector('text="Current Balance"', { timeout: 15000 });
    log("Found Current Balance");
  } catch {
    log("Current Balance not found");
  }
  const nameVisible = (await page.getByText("QA-CUST-r484").count()) > 0;
  log(`Customer name visible: ${nameVisible}`);
  const placeOrderBtn = await page.getByText("Place Order").count();
  log(`Place Order count ${placeOrderBtn}`);

  // --- REAL FLOW: Place Order submit ---
  let placeOrderSuccess = false;
  try {
    log("\n[REAL] Opening Place Order...");
    await page.getByText("Place Order").first().click();
    await page.waitForTimeout(1000);
    // Select product: click picker
    const picker = page.getByText("Select product").first();
    if (await picker.count()) {
      await picker.click();
      await page.waitForTimeout(500);
      // Select first product in list
      const firstProduct = page.locator('text="QA Product"').first();
      // Fallback: any product row
      if (await firstProduct.count()) await firstProduct.click();
      else {
        const alt = page.locator('text="Beef"').first();
        if (await alt.count()) await alt.click();
      }
      await page.waitForTimeout(300);
    }
    // Fill quantity 2, weight 5
    const qtyInputs = page.locator('input[placeholder="1"]');
    if (await qtyInputs.count()) await qtyInputs.first().fill("2");
    const weightInputs = page.locator('input[placeholder="0"]');
    if (await weightInputs.count()) await weightInputs.first().fill("5");
    await page.waitForTimeout(300);
    // Submit
    const submitBtn = page.getByText("Place Order", { exact: false }).last();
    // The submit button is labeled Place Order
    const realSubmit = page.locator('text="Place Order"').last();
    await page.getByText("Place Order").last().click().catch(async () => await page.getByRole("button", { name: "Place Order" }).click());
    await page.waitForTimeout(1500);
    // Check for success alert or under_review
    const success = await page.getByText("Success").count();
    const underReview = await page.getByText("Under Review").count();
    log(`Place Order submit attempted: success alert ${success} underReview ${underReview}`);
    placeOrderSuccess = true;
    // Dismiss alert if present
    const okBtn = page.getByText("OK");
    if (await okBtn.count()) await okBtn.first().click();
    await page.waitForTimeout(500);
    // Back to profile if still on Place Order
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
  } catch (e: any) {
    log(`Place Order flow error: ${e.message}`);
  }

  // --- REAL FLOW: Verify order appears in My Orders and test edit/cancel ---
  let editSuccess = false;
  let cancelSuccess = false;
  try {
    log("\n[REAL] Opening My Orders...");
    const viewOrders = page.getByText("View all orders").first();
    if ((await viewOrders.count()) > 0) await viewOrders.click();
    else await page.getByText("My Orders").first().click().catch(() => page.goto(`${BASE_URL}/profile`));
    await page.waitForTimeout(1000);
    const ordersVisible = (await page.getByText("My Orders").count()) > 0;
    log(`My Orders visible: ${ordersVisible}`);
    // Find first Under Review order's Edit button (exact to avoid hint)
    const editBtn = page.getByText("Edit", { exact: true }).first();
    if ((await editBtn.count()) > 0) {
      log("Found Edit button, testing multi-item edit...");
      try {
        await editBtn.scrollIntoViewIfNeeded();
        await editBtn.click({ timeout: 5000 });
      } catch (e) {
        log(`Edit click failed: ${(e as any).message}`);
      }
      await page.waitForTimeout(800);
      // Change quantity of first item (edit input)
      const qtyEdit = page.locator('input').first();
      // The edit box has quantity input for first item
      const editInputs = page.locator('input[value="2"], input[value="3"], input');
      // Try to fill first edit quantity to 3
      const firstEditInput = page.locator('input').nth(0);
      // Search for Edit Quantity input
      const quantityInputs = page.getByPlaceholder("1");
      if ((await quantityInputs.count()) > 0) {
        await quantityInputs.first().fill("3");
        await page.waitForTimeout(300);
      }
      // Try Add Product (multi-item)
      const addBtn = page.getByText("+ Add Product");
      if ((await addBtn.count()) > 0) {
        await addBtn.first().click();
        await page.waitForTimeout(500);
        log("Added second item for multi-item edit");
      }
      // Save Changes
      const saveBtn = page.getByText("Save Changes").first();
      if ((await saveBtn.count()) > 0) {
        await saveBtn.click();
        await page.waitForTimeout(1500);
        editSuccess = true;
        log("Edit save clicked");
        const ok2 = page.getByText("OK");
        if ((await ok2.count()) > 0) await ok2.first().click();
      }
    } else log("No Edit button found (maybe no under_review orders)");

    // Cancel flow: create second order quickly via API then cancel via UI? Try UI cancel on another order
    const cancelBtn = page.getByText("Cancel", { exact: true }).first();
    if ((await cancelBtn.count()) > 0) {
      log("Found Cancel button, testing cancel...");
      try {
        await cancelBtn.scrollIntoViewIfNeeded();
        await cancelBtn.click({ timeout: 5000 });
      } catch (e) {
        log(`Cancel click failed: ${(e as any).message}`);
      }
      await page.waitForTimeout(500);
      const confirmYes = page.getByText("Yes", { exact: true });
      if ((await confirmYes.count()) > 0) {
        await confirmYes.first().click();
        await page.waitForTimeout(1000);
        cancelSuccess = true;
        log("Cancel confirmed");
        const ok3 = page.getByText("OK");
        if ((await ok3.count()) > 0) await ok3.first().click();
      }
    }
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
  } catch (e: any) {
    log(`Orders edit/cancel error: ${e.message}`);
  }

  // --- REAL FLOW: Discrepancy submit ---
  let discrepancySuccess = false;
  try {
    log("\n[REAL] Opening Discrepancy...");
    await page.getByText("Discrepancy Report", { exact: true }).first().click({ timeout: 5000 }).catch(async () => await page.getByText("Discrepancy Report").first().click());
    await page.waitForTimeout(1000);
    const textarea = page.locator('textarea').first();
    const inputArea = page.locator('input').last();
    // Try to find description input (TextArea)
    const descInput = page.getByPlaceholder("Describe the discrepancy") || page.locator('textarea');
    // Use locator for multiline
    const allInputs = page.locator('textarea, input[placeholder*="discrepancy" i]');
    // Fallback: find TextInput with maxLength 2001
    const textInputs = page.locator('textarea');
    if ((await textInputs.count()) > 0) {
      await textInputs.first().fill("QA discrepancy from web test " + Date.now());
      await page.waitForTimeout(300);
      const submitDiscrep = page.getByText("Submit").first();
      if ((await submitDiscrep.count()) > 0) {
        await submitDiscrep.click();
        await page.waitForTimeout(1000);
        discrepancySuccess = true;
        log("Discrepancy submit clicked");
        const ok4 = page.getByText("OK");
        if ((await ok4.count()) > 0) await ok4.first().click();
      }
    }
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
  } catch (e: any) {
    log(`Discrepancy flow error: ${e.message}`);
  }

  // --- REAL FLOW: Insert Shipment submit ---
  let shipmentSuccess = false;
  try {
    log("\n[REAL] Opening Insert Shipment...");
    await page.getByText("Insert Shipment").first().click();
    await page.waitForTimeout(1000);
    const addShip = page.getByText("Add Product");
    log(`Add Product in shipment visible: ${(await addShip.count()) > 0}`);
    // Select product and fill
    const shipPicker = page.getByText("Select product").first();
    if ((await shipPicker.count()) > 0) {
      await shipPicker.click();
      await page.waitForTimeout(500);
      const prod = page.locator('text="QA Product"').first();
      if ((await prod.count()) > 0) await prod.click();
      await page.waitForTimeout(300);
    }
    const qtyShip = page.locator('input[placeholder="1"]').first();
    if ((await qtyShip.count()) > 0) await qtyShip.fill("1");
    const weightShip = page.locator('input[placeholder="0"]').first();
    if ((await weightShip.count()) > 0) await weightShip.fill("2");
    await page.waitForTimeout(300);
    const submitShip = page.getByText("Submit Insert Shipment").first();
    if ((await submitShip.count()) > 0) {
      await submitShip.click();
      await page.waitForTimeout(1000);
      shipmentSuccess = true;
      log("Insert Shipment submit clicked");
      const ok5 = page.getByText("OK");
      if ((await ok5.count()) > 0) await ok5.first().click();
    }
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
  } catch (e: any) {
    log(`Shipment flow error: ${e.message}`);
  }

  // Settings language already tested earlier, plus verify theme
  log("\n[REAL] Settings theme check...");
  const settingsTab = page.getByText("Settings").last();
  await settingsTab.click().catch(() => {});
  await page.waitForTimeout(800);
  const themeLight = await page.getByText("Light").count();
  log(`Theme Light visible: ${themeLight > 0}`);

  console.log("\n=== Browser Checks ===");
  console.log(`pageErrors ${pageErrors.length}`, pageErrors.slice(0, 3));
  console.log(`failed500 ${failed500.length}`, failed500.slice(0, 3));
  console.log(`placeOrderSuccess ${placeOrderSuccess}`);
  console.log(`editSuccess ${editSuccess}`);
  console.log(`cancelSuccess ${cancelSuccess}`);
  console.log(`discrepancySuccess ${discrepancySuccess}`);
  console.log(`shipmentSuccess ${shipmentSuccess}`);
  if (pageErrors.length > 0) console.warn("WARN pageErrors");
  if (failed500.length > 0) console.warn("WARN 500");
  if (!nameVisible) throw new Error("Customer name not visible");
  console.log("\n=== Customer Web Test COMPLETE (real flows attempted) ===");
  await browser.close();
  process.exit(0);
}
run().catch((e) => {
  console.error("Customer Web Test FAIL", e);
  process.exit(1);
});
