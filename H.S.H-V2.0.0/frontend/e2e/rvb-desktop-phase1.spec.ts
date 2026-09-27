// @ts-nocheck
import { test, expect } from "@playwright/test";
import { deflateSync } from "node:zlib";

const WEB_BASE = "http://localhost:3001";
const API_BASE = "http://localhost:5001";
const QA_PASSWORD = "Rvb-QA-P1!Base";
const TEMP_PASSWORD = "Rvb-QA-P1!Temp";
const CHANGED_PASSWORD = "Rvb-QA-P1!Changed";

const QA_USERS = {
  manager: { tag: "qa.rvb.p1.manager", role: "manager" },
  admin: { tag: "qa.rvb.p1.admin", role: "admin" },
  supervisor: { tag: "qa.rvb.p1.supervisor", role: "supervisor" },
  worker: { tag: "qa.rvb.p1.worker", role: "worker" },
  supplier: { tag: "qa.rvb.p1.supplier", role: "supplier" },
  customer: { tag: "qa.rvb.p1.customer", role: "customer" },
};

function uniqueTag(label: string) {
  return `qa.rvb.p1.${label}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBytes, data]);
  let crc = 0xffffffff;
  for (const byte of crcInput) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0);
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function createNoisyQaPng(width = 800, height = 600) {
  const rowBytes = width * 4 + 1;
  const pixels = Buffer.alloc(rowBytes * height);
  let seed = 0x12345678;
  for (let y = 0; y < height; y++) {
    const row = y * rowBytes;
    pixels[row] = 0;
    for (let x = 0; x < width; x++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      const offset = row + 1 + x * 4;
      pixels[offset] = seed & 0xff;
      pixels[offset + 1] = (seed >>> 8) & 0xff;
      pixels[offset + 2] = (seed >>> 16) & 0xff;
      pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function submitLogin(page, tag: string, password: string) {
  await page.goto("/rvb/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#rvb-tag-input")).toBeVisible();
  const responsePromise = page.waitForResponse((response) =>
    response.url() === `${API_BASE}/api/rvb/auth/login` && response.request().method() === "POST",
  );
  await page.locator("#rvb-tag-input").fill(tag);
  await page.locator("#rvb-password-input").fill(password);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  const response = await responsePromise;
  return { response, body: await response.json().catch(() => ({})) };
}

async function signInAndLand(page, tag: string, password = QA_PASSWORD) {
  const result = await submitLogin(page, tag, password);
  expect(result.response.status(), `login response for @${tag}`).toBe(200);
  await expect(page).toHaveURL(/\/rvb\/?$/);
  const normalizedTag = tag.startsWith("@") ? tag.slice(1) : tag;
  await expect(page.locator("aside")).toContainText(`@${normalizedTag}`);
  await expect(page.locator("aside")).toContainText(result.body.account.role);
  return result.body;
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign Out", exact: true }).click();
  await expect(page).toHaveURL(/\/rvb\/login$/);
}

async function refreshCookie(context) {
  const cookies = await context.cookies(WEB_BASE);
  return cookies.find((cookie) => cookie.name === "rvb_refresh_token") || null;
}

async function selectStyledOption(page, dialog, label: string, option: string | RegExp) {
  const trigger = dialog.getByRole("button", { name: label, exact: true });
  if (typeof option === "string" && (await trigger.innerText()).trim() === option) return;
  await trigger.click();
  await page.getByRole("option", { name: option }).click();
}

async function openAccountCreate(page, role: string) {
  await page.goto("/rvb/accounts", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Create Account", exact: true }).first().click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  await selectStyledOption(page, dialog, "Role", role);
  return dialog;
}

async function finishAccountCreate(page, dialog, { tag, password = TEMP_PASSWORD, displayName, entityName }: any) {
  if (entityName) {
    const entityButton = dialog.getByRole("button", { name: "Linked Entity", exact: true });
    await expect(entityButton).toBeEnabled();
    await entityButton.click();
    await page.getByRole("option", { name: new RegExp(entityName) }).click();
  } else if (displayName) {
    await dialog.locator("#create-displayName").fill(displayName);
  }
  await dialog.locator("#create-tag").fill(tag);
  await dialog.locator("#create-password").fill(password);
  await dialog.locator("#create-confirm").fill(password);
  const createResponsePromise = page.waitForResponse((response) =>
    response.url() === `${API_BASE}/api/rvb/accounts` && response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Create Account", exact: true }).click();
  const response = await createResponsePromise;
  return { response, body: await response.json().catch(() => ({})) };
}

function hshSyncRequestMatches(response, predicate) {
  if (response.url() !== `${API_BASE}/api/sync` || response.request().method() !== "POST") return false;
  try {
    return (response.request().postDataJSON()?.operations || []).some(predicate);
  } catch {
    return false;
  }
}

async function waitForHshEntityOperation(page, entity: string, entityId: string, operation: string, expectedStatus?: string) {
  const response = await page.waitForResponse((candidate) => hshSyncRequestMatches(candidate, (item) =>
    item.entity === entity && item.entityId === entityId && item.operation === operation &&
    (expectedStatus === undefined || item.payload?.status === expectedStatus),
  ));
  expect(response.status()).toBe(200);
  const result = (await response.json()).results.find((item) => item.entity === entity && item.entityId === entityId && item.operation === operation);
  expect(result?.success).toBe(true);
  return result;
}

async function ensureHshWorkerPosition(page) {
  const syncReadPromise = page.waitForResponse((response) =>
    response.url().startsWith(`${API_BASE}/api/sync/bootstrap`) || response.url().startsWith(`${API_BASE}/api/sync/changes?`),
    { timeout: 30_000 },
  );
  await page.goto("/settings?section=master-data", { waitUntil: "domcontentloaded" });
  const syncRead = await syncReadPromise;
  expect(syncRead.status()).toBe(200);
  const positionRow = page.getByRole("button", { name: /Worker Positions/ }).first();
  await expect(positionRow).toBeVisible();
  if (await positionRow.getAttribute("aria-expanded") !== "true") await positionRow.click();
  const positionItem = page.getByText("QA Butcher", { exact: true });
  if (!(await positionItem.isVisible().catch(() => false))) {
    const input = page.getByPlaceholder("Add worker position").first();
    await expect(input).toBeVisible();
    await input.fill("QA Butcher");
    await input.locator("xpath=..").getByRole("button", { name: "Add", exact: true }).click();
  }
  await expect(page.getByText("QA Butcher", { exact: true })).toBeVisible();
}

async function createHshWorkerThroughUi(page, name: string, phone: string) {
  await ensureHshWorkerPosition(page);
  await page.goto("/workers", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add Worker", exact: true }).click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog).toBeVisible();
  await dialog.locator("input").nth(0).fill(name);
  await dialog.locator("input").nth(1).fill(phone);
  await selectStyledOption(page, dialog, "Position", "QA Butcher");
  await dialog.locator('input[type="number"]').nth(0).fill("0");
  await dialog.locator('input[type="number"]').nth(1).fill("0");
  const createSyncPromise = page.waitForResponse((response) => hshSyncRequestMatches(response, (operation) =>
    operation.entity === "worker" && operation.operation === "create" && operation.payload?.name === name,
  ));
  await dialog.getByRole("button", { name: "Create Worker", exact: true }).click();
  await expect(dialog).toBeHidden();
  const syncResponse = await createSyncPromise;
  expect(syncResponse.status()).toBe(200);
  const requestOperations = syncResponse.request().postDataJSON().operations;
  const createOperation = requestOperations.find((operation) => operation.entity === "worker" && operation.operation === "create" && operation.payload?.name === name);
  const responseBody = await syncResponse.json();
  const result = responseBody.results.find((item) => item.entity === "worker" && item.entityId === createOperation.entityId);
  expect(result?.success).toBe(true);
  await expect(page.locator("article").filter({ hasText: name })).toBeVisible();
  return { id: createOperation.entityId, worker: result.canonicalEntity };
}

async function createHshSupplierThroughUi(page, name: string, phone: string) {
  await ensureHshWorkerPosition(page);
  await page.goto("/suppliers", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add Supplier", exact: true }).click();
  const dialog = page.getByRole("heading", { name: "Add Supplier", exact: true }).locator("xpath=ancestor::section[1]");
  await expect(dialog).toBeVisible();
  await dialog.locator("input").nth(0).fill(name);
  await dialog.locator("input").nth(1).fill(phone);
  const createSyncPromise = page.waitForResponse((response) => hshSyncRequestMatches(response, (operation) =>
    operation.entity === "supplier" && operation.operation === "create" && operation.payload?.name === name,
  ));
  await dialog.getByRole("button", { name: "Create Supplier", exact: true }).click();
  await expect(dialog).toBeHidden();
  const response = await createSyncPromise;
  expect(response.status()).toBe(200);
  const operations = response.request().postDataJSON().operations;
  const createOperation = operations.find((operation) => operation.entity === "supplier" && operation.operation === "create" && operation.payload?.name === name);
  const result = (await response.json()).results.find((item) => item.entity === "supplier" && item.entityId === createOperation.entityId);
  expect(result?.success).toBe(true);
  return { id: createOperation.entityId, supplier: result.canonicalEntity };
}

async function createHshCustomerThroughUi(page, name: string, phone: string) {
  await ensureHshWorkerPosition(page);
  await page.goto("/customers", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add Customer", exact: true }).click();
  const dialog = page.getByRole("heading", { name: "Add Customer", exact: true }).locator("xpath=ancestor::section[1]");
  await expect(dialog).toBeVisible();
  await dialog.locator("input").nth(0).fill(name);
  await dialog.locator("input").nth(1).fill(phone);
  const typeSelect = dialog.locator('button[aria-haspopup="listbox"]').first();
  if (!(await typeSelect.innerText()).toLowerCase().includes("consumer")) {
    await typeSelect.click();
    await page.getByRole("option", { name: "consumer", exact: true }).click();
  }
  const createSyncPromise = page.waitForResponse((response) => hshSyncRequestMatches(response, (operation) =>
    operation.entity === "customer" && operation.operation === "create" && operation.payload?.name === name,
  ));
  await dialog.getByRole("button", { name: "Create Customer", exact: true }).click();
  await expect(dialog).toBeHidden();
  const response = await createSyncPromise;
  expect(response.status()).toBe(200);
  const operations = response.request().postDataJSON().operations;
  const createOperation = operations.find((operation) => operation.entity === "customer" && operation.operation === "create" && operation.payload?.name === name);
  const result = (await response.json()).results.find((item) => item.entity === "customer" && item.entityId === createOperation.entityId);
  expect(result?.success).toBe(true);
  return { id: createOperation.entityId, customer: result.canonicalEntity };
}

async function deleteHshSupplierOrCustomerThroughUi(page, entity: "supplier" | "customer", name: string, entityId: string) {
  await ensureHshWorkerPosition(page);
  const plural = entity === "supplier" ? "suppliers" : "customers";
  const searchLabel = entity === "supplier" ? "Search suppliers..." : "Search customers...";
  await page.goto(`/${plural}`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(searchLabel).fill(name);
  const row = page.locator("article").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const title = `Delete ${name}?`;
  const dialog = page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::section[1]");
  const confirm = dialog.getByRole("button", { name: /Delete Permanently|^Delete$/i }).last();
  await expect(confirm).toBeEnabled({ timeout: 8_000 });
  const deleteSync = waitForHshEntityOperation(page, entity, entityId, "delete");
  await confirm.click();
  await deleteSync;
  await expect(row).toHaveCount(0);
}

async function archiveHshWorkerThroughUi(page, name: string, workerId: string) {
  await ensureHshWorkerPosition(page);
  await page.goto("/workers", { waitUntil: "domcontentloaded" });
  await page.getByRole("searchbox", { name: "Search workers..." }).fill(name);
  const row = page.locator("article").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Archive ${name}` }).click();
  const dialog = page.getByRole("dialog").last();
  const confirm = dialog.getByRole("button", { name: "Archive", exact: true });
  await expect(confirm).toBeEnabled({ timeout: 15_000 });
  const sync = waitForHshEntityOperation(page, "worker", workerId, "update", "archived");
  await confirm.click();
  await sync;
  await expect(row.getByRole("button", { name: `Restore ${name}` })).toBeVisible();
}

async function restoreHshWorkerThroughUi(page, name: string, workerId: string) {
  await ensureHshWorkerPosition(page);
  await page.goto("/workers", { waitUntil: "domcontentloaded" });
  await page.getByRole("searchbox", { name: "Search workers..." }).fill(name);
  const row = page.locator("article").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Restore ${name}` }).click();
  const dialog = page.getByRole("dialog").last();
  await dialog.locator('input[type="number"]').nth(0).fill("0");
  await dialog.locator('input[type="number"]').nth(1).fill("0");
  const sync = waitForHshEntityOperation(page, "worker", workerId, "update", "active");
  await dialog.getByRole("button", { name: "Restore", exact: true }).click();
  await sync;
  await expect(row.getByRole("button", { name: `Archive ${name}` })).toBeVisible();
}

async function deleteHshWorkerThroughUi(page, name: string, workerId: string) {
  await ensureHshWorkerPosition(page);
  await page.goto("/workers", { waitUntil: "domcontentloaded" });
  await page.getByRole("searchbox", { name: "Search workers..." }).fill(name);
  const row = page.locator("article").filter({ hasText: name }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: `Delete ${name}` }).click();
  const dialog = page.getByRole("dialog").last();
  const confirm = dialog.getByRole("button", { name: "Delete", exact: true });
  await expect(confirm).toBeEnabled({ timeout: 8_000 });
  const sync = waitForHshEntityOperation(page, "worker", workerId, "delete");
  await confirm.click();
  await sync;
  await expect(row).toHaveCount(0);
}

async function getRvbAccount(request, accessToken: string, accountId: string) {
  const response = await request.get(`${API_BASE}/api/rvb/accounts/${encodeURIComponent(accountId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).account;
}

function trackAccessToken(page, initialToken: string) {
  const state = { token: initialToken };
  const updates: Promise<void>[] = [];
  page.on("response", (response) => {
    if (response.url() === `${API_BASE}/api/rvb/auth/refresh` && response.status() === 200) {
      updates.push(response.json().then((body) => {
        if (body.accessToken) state.token = body.accessToken;
      }).catch(() => {}));
    }
  });
  return async () => {
    await Promise.all(updates);
    return state.token;
  };
}

test.describe("R.V.B Desktop Phase 1 — dedicated Chromium closeout", () => {
  test("login, invalid login, hard reload refresh, logout and protected-route redirect", async ({ page, request }) => {
    const invalid = await submitLogin(page, QA_USERS.manager.tag, "Wrong-Rvb-QA-P1!Password");
    expect(invalid.response.status()).toBe(401);
    await expect(page.locator("#rvb-login-error")).toHaveText("Invalid @tag or password");
    expect((await page.context().cookies(WEB_BASE)).some((cookie) => cookie.name === "rvb_refresh_token")).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("rvb_has_session"))).toBeNull();

    const loggedIn = await signInAndLand(page, QA_USERS.manager.tag);
    expect(loggedIn.account.role).toBe("manager");
    expect(loggedIn.account.onboardingStatus).toBe("complete");
    const activeSessions = await request.get(`${API_BASE}/api/rvb/auth/sessions`, {
      headers: { Authorization: `Bearer ${loggedIn.accessToken}` },
    });
    expect(activeSessions.status()).toBe(200);
    expect((await activeSessions.json()).sessions).toHaveLength(1);
    const cookieBeforeReload = await refreshCookie(page.context());
    expect(cookieBeforeReload?.httpOnly).toBe(true);

    const refreshStatuses: number[] = [];
    page.on("response", (response) => {
      if (response.url() === `${API_BASE}/api/rvb/auth/refresh`) refreshStatuses.push(response.status());
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/rvb\/?$/);
    await expect(page.locator("aside")).toContainText(`@${QA_USERS.manager.tag}`);
    await expect.poll(() => refreshStatuses.length).toBe(1);
    expect(refreshStatuses).toEqual([200]);
    expect(await page.evaluate(() => localStorage.getItem("rvb_has_session"))).toBe("1");
    expect(await page.evaluate(() => localStorage.getItem("rvb_access_token"))).toBeNull();

    await signOut(page);
    expect(await refreshCookie(page.context())).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("rvb_has_session"))).toBeNull();
    await page.goto("/rvb/accounts", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/rvb\/login$/);
    expect((await request.get(`${API_BASE}/api/rvb/accounts`)).status()).toBe(401);
  });

  test("revoked refresh session fails once on reload and clears the authenticated UI", async ({ page, browser }) => {
    await signInAndLand(page, QA_USERS.manager.tag);

    const otherContext = await browser.newContext({ baseURL: WEB_BASE });
    const otherPage = await otherContext.newPage();
    await signInAndLand(otherPage, QA_USERS.manager.tag);
    await otherPage.locator("aside nav").getByRole("button", { name: "Settings", exact: true }).click();
    await otherPage.locator('[aria-label="Settings navigation"] button').nth(3).click();
    const revokeOthers = otherPage.getByRole("button", { name: "Sign out other sessions", exact: true });
    await expect(revokeOthers).toBeVisible();
    await revokeOthers.click();
    await expect(revokeOthers).toBeHidden();

    const refreshStatuses: number[] = [];
    page.on("response", (response) => {
      if (response.url() === `${API_BASE}/api/rvb/auth/refresh`) refreshStatuses.push(response.status());
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/rvb\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to RVB" })).toBeVisible();
    await expect.poll(() => refreshStatuses.length).toBe(1);
    expect(refreshStatuses).toEqual([401]);
    expect(await page.evaluate(() => localStorage.getItem("rvb_has_session"))).toBeNull();
    await page.waitForTimeout(800);
    expect(refreshStatuses).toHaveLength(1);
    await otherContext.close();
  });

  test("first-login password change and PFP onboarding cannot be bypassed; compressed image persists after reload", async ({ page, browser, request }) => {
    await signInAndLand(page, QA_USERS.manager.tag);
    const tag = uniqueTag("first");
    const accountDialog = await openAccountCreate(page, "Admin");
    const createdFirstLoginAccount = await finishAccountCreate(page, accountDialog, {
      tag,
      password: TEMP_PASSWORD,
      displayName: "QA RVB Phase1 First Login",
    });
    expect(createdFirstLoginAccount.response.status()).toBe(201);
    await expect(accountDialog).toBeHidden();

    const firstLoginContext = await browser.newContext({ baseURL: WEB_BASE });
    const firstLoginPage = await firstLoginContext.newPage();
    const firstLogin = await submitLogin(firstLoginPage, tag, TEMP_PASSWORD);
    expect(firstLogin.response.status()).toBe(200);
    expect(firstLogin.body.mustChangePassword).toBe(true);
    await expect(firstLoginPage).toHaveURL(/\/rvb\/auth\/change-password$/);
    await firstLoginPage.goto("/rvb/settings", { waitUntil: "domcontentloaded" });
    await expect(firstLoginPage).toHaveURL(/\/rvb\/auth\/change-password$/);

    const oldRefreshCookie = await refreshCookie(firstLoginContext);
    expect(oldRefreshCookie).toBeTruthy();
    const changePasswordResponse = firstLoginPage.waitForResponse((response) =>
      response.url() === `${API_BASE}/api/rvb/auth/change-password` && response.request().method() === "POST",
    );
    await firstLoginPage.locator("#rvb-current-pwd").fill(TEMP_PASSWORD);
    await firstLoginPage.locator("#rvb-new-pwd").fill(CHANGED_PASSWORD);
    await firstLoginPage.locator("#rvb-confirm-pwd").fill(CHANGED_PASSWORD);
    await firstLoginPage.getByRole("button", { name: "Change Password", exact: true }).click();
    const changed = await changePasswordResponse;
    expect(changed.status()).toBe(200);
    const changedBody = await changed.json();
    expect(changedBody.account.mustChangePassword).toBe(false);
    await expect(firstLoginPage).toHaveURL(/\/rvb\/onboarding$/);

    const rotatedCookie = await refreshCookie(firstLoginContext);
    expect(rotatedCookie).toBeTruthy();
    expect(rotatedCookie.value).not.toBe(oldRefreshCookie.value);
    const staleRefresh = await request.post(`${API_BASE}/api/rvb/auth/refresh`, {
      headers: { Cookie: `rvb_refresh_token=${oldRefreshCookie.value}` },
      data: {},
    });
    expect(staleRefresh.status()).toBe(401);

    await firstLoginPage.goto("/rvb/customers", { waitUntil: "domcontentloaded" });
    await expect(firstLoginPage).toHaveURL(/\/rvb\/onboarding$/);
    await firstLoginPage.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(firstLoginPage).toHaveURL(/\/rvb\/login$/);

    const oldPasswordLogin = await submitLogin(firstLoginPage, tag, TEMP_PASSWORD);
    expect(oldPasswordLogin.response.status()).toBe(401);
    await expect(firstLoginPage.locator("#rvb-login-error")).toHaveText("Invalid @tag or password");
    const newPasswordLogin = await submitLogin(firstLoginPage, tag, CHANGED_PASSWORD);
    expect(newPasswordLogin.response.status()).toBe(200);
    await expect(firstLoginPage).toHaveURL(/\/rvb\/onboarding$/);

    const originalPng = createNoisyQaPng();
    expect(originalPng.length).toBeGreaterThan(250_000);
    await firstLoginPage.locator('input[type="file"]').setInputFiles({
      name: "qa-first-login-avatar.png",
      mimeType: "image/png",
      buffer: originalPng,
    });
    const preview = firstLoginPage.locator('img[class*="avatarImg"]');
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);
    await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(512);
    const compressedDataUrl = await preview.getAttribute("src");
    expect(compressedDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(compressedDataUrl.length).toBeLessThan(200_000);

    const onboardingResponse = firstLoginPage.waitForResponse((response) =>
      response.url() === `${API_BASE}/api/rvb/auth/onboarding` && response.request().method() === "POST",
    );
    await firstLoginPage.getByRole("button", { name: "Complete onboarding", exact: true }).click();
    const onboarding = await onboardingResponse;
    expect(onboarding.status()).toBe(200);
    const onboardedBody = await onboarding.json();
    expect(onboardedBody.account.onboardingStatus).toBe("complete");
    expect(onboardedBody.account.profilePicture).toBe(compressedDataUrl);
    await expect(firstLoginPage).toHaveURL(/\/rvb\/?$/);
    const shellPfp = firstLoginPage.locator('aside img[src^="data:image/jpeg"]');
    await expect(shellPfp).toBeVisible();
    expect(await shellPfp.getAttribute("src")).toBe(compressedDataUrl);

    await firstLoginPage.reload({ waitUntil: "domcontentloaded" });
    await expect(firstLoginPage).toHaveURL(/\/rvb\/?$/);
    await expect(firstLoginPage.locator('aside img[src^="data:image/jpeg"]')).toBeVisible();
    expect(await firstLoginPage.locator('aside img[src^="data:image/jpeg"]').getAttribute("src")).toBe(compressedDataUrl);
    await firstLoginContext.close();
  });

  test("all six QA roles land correctly and enforce visible plus server-side guards", async ({ browser, request }) => {
    const managerNav = ["RVB Dashboard", "Accounts & Access", "Workers", "Suppliers", "Customers", "Orders", "Requests", "Chats", "Notifications & Activity", "Directory", "Settings"];
    const portalNav = ["Main Chats", "Secondary Chats", "Profile & Management", "Search", "Settings"];
    for (const user of Object.values(QA_USERS)) {
      const roleContext = await browser.newContext({ baseURL: WEB_BASE });
      const rolePage = await roleContext.newPage();
      try {
        const result = await signInAndLand(rolePage, user.tag);
        expect(result.account.role).toBe(user.role);
        const nav = rolePage.locator("aside nav");
        if (user.role === "manager" || user.role === "admin") {
          for (const label of managerNav) await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
        } else if (user.role === "supervisor") {
          for (const label of [...portalNav, "Customers"]) await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
          for (const label of ["Accounts & Access", "Workers", "Suppliers"]) await expect(nav.getByRole("button", { name: label, exact: true })).toHaveCount(0);
        } else {
          for (const label of portalNav) await expect(nav.getByRole("button", { name: label, exact: true })).toBeVisible();
          for (const label of ["Accounts & Access", "Workers", "Suppliers", "Customers", "Orders", "Requests"]) await expect(nav.getByRole("button", { name: label, exact: true })).toHaveCount(0);
        }

        const authHeaders = { Authorization: `Bearer ${result.accessToken}` };
        const accountsResponse = await request.get(`${API_BASE}/api/rvb/accounts`, { headers: authHeaders });
        expect(accountsResponse.status()).toBe(user.role === "manager" || user.role === "admin" ? 200 : 403);

        if (user.role === "supervisor") {
          expect((await request.get(`${API_BASE}/api/rvb/customers`, { headers: authHeaders })).status()).toBe(200);
          expect((await request.get(`${API_BASE}/api/rvb/workers`, { headers: authHeaders })).status()).toBe(403);
          expect((await request.get(`${API_BASE}/api/rvb/suppliers`, { headers: authHeaders })).status()).toBe(403);
          const ownWorker = await request.get(`${API_BASE}/api/rvb/portal/worker`, { headers: authHeaders });
          expect(ownWorker.status()).toBe(200);
          expect((await ownWorker.json()).worker.id).toBe("qa-rvb-p1-worker-supervisor");
        }

        if (user.role === "manager" || user.role === "admin") {
          await rolePage.goto("/rvb/accounts", { waitUntil: "domcontentloaded" });
          await expect(rolePage).toHaveURL(/\/rvb\/accounts$/);
        } else if (user.role === "supervisor") {
          await rolePage.goto("/rvb/customers", { waitUntil: "domcontentloaded" });
          await expect(rolePage).toHaveURL(/\/rvb\/customers$/);
          for (const path of ["/rvb/accounts", "/rvb/workers", "/rvb/suppliers"]) {
            await rolePage.goto(path, { waitUntil: "domcontentloaded" });
            await expect(rolePage).toHaveURL(/\/rvb\/?$/);
          }
        } else {
          await rolePage.goto("/rvb/accounts", { waitUntil: "domcontentloaded" });
          await expect(rolePage).toHaveURL(/\/rvb\/?$/);
        }
      } finally {
        await roleContext.close();
      }
    }
  });

  test("linkable lookup failure is visible, distinct from empty results, and recoverable by retry", async ({ page }) => {
    await signInAndLand(page, QA_USERS.manager.tag);
    await page.goto("/rvb/accounts", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Create Account", exact: true }).first().click();
    const dialog = page.getByRole("dialog").last();
    let shouldFail = true;
    const linkableMatcher = (url) => {
      const parsed = new URL(url);
      return parsed.pathname === "/api/rvb/accounts/linkable" && parsed.searchParams.get("type") === "worker";
    };
    await page.route(linkableMatcher, async (route) => {
      if (shouldFail) {
        shouldFail = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ success: false, code: "QA_LINKABLE_UNAVAILABLE" }),
        });
      } else {
        await route.continue();
      }
    });
    await selectStyledOption(page, dialog, "Role", "Worker");
    const failure = dialog.getByRole("alert");
    await expect(failure).toContainText("Could not load linkable entities");
    await expect(dialog.getByText("No available entities — all are already linked.", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Linked Entity", exact: true }).click();
    await expect(page.getByRole("option", { name: /QA RVB Phase1 Unlinked Worker/ })).toBeVisible();
    await page.unroute(linkableMatcher);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  test("visible account/entity linking, duplicate conflicts, immutable tags and access lifecycle", async ({ page, request }) => {
    const manager = await signInAndLand(page, QA_USERS.manager.tag);
    const latestManagerToken = trackAccessToken(page, manager.accessToken);
    const configResponse = await request.patch(`${API_BASE}/api/rvb/config`, {
      headers: { Authorization: `Bearer ${await latestManagerToken()}` },
      data: { language: "en", currency: "DA", workerPositions: ["QA Butcher"] },
    });
    expect(configResponse.status()).toBe(200);

    const workerName = `QA RVB Link Worker ${Date.now().toString(36)}`;
    const createdWorkerResult = await createHshWorkerThroughUi(page, workerName, "5550109001");
    const createdWorker = createdWorkerResult.worker;

    const workerTag = uniqueTag("linked");
    const createWorkerAccount = await openAccountCreate(page, "Worker");
    const createdWorkerAccount = await finishAccountCreate(page, createWorkerAccount, { tag: workerTag, password: TEMP_PASSWORD, entityName: workerName });
    expect(createdWorkerAccount.response.status()).toBe(201);
    expect(createdWorkerAccount.body.account.linkedEntityType).toBe("worker");
    expect(createdWorkerAccount.body.account.linkedEntityId).toBe(createdWorker.id);
    await expect(createWorkerAccount).toBeHidden();

    const listedResponse = await request.get(`${API_BASE}/api/rvb/accounts`, {
      headers: { Authorization: `Bearer ${await latestManagerToken()}` },
    });
    expect(listedResponse.status()).toBe(200);
    const listed = await listedResponse.json();
    const linkedAccount = listed.accounts.find((account) => account.tag === workerTag);
    expect(linkedAccount).toBeTruthy();
    expect(linkedAccount.tag).toBe(workerTag);
    expect(linkedAccount.role).toBe("worker");
    expect(linkedAccount.linkedEntityType).toBe("worker");
    expect(linkedAccount.linkedEntityId).toBe(createdWorker.id);
    expect(createdWorker.name).toBe(workerName);

    const duplicateTagDialog = await openAccountCreate(page, "Admin");
    const duplicateTag = await finishAccountCreate(page, duplicateTagDialog, {
      tag: workerTag,
      password: TEMP_PASSWORD,
      displayName: "QA RVB duplicate tag probe",
    });
    expect(duplicateTag.response.status()).toBe(409);
    await expect(duplicateTagDialog.getByRole("alert")).toContainText("Tag already exists");
    await duplicateTagDialog.getByRole("button", { name: "Cancel", exact: true }).click();

    const secondAccountTag = uniqueTag("second");
    const secondAccountDialog = await openAccountCreate(page, "Supervisor");
    const secondAccount = await finishAccountCreate(page, secondAccountDialog, {
      tag: secondAccountTag,
      password: TEMP_PASSWORD,
      displayName: "QA RVB duplicate entity supervisor",
    });
    expect(secondAccount.response.status()).toBe(201);
    await expect(secondAccountDialog).toBeHidden();

    const secondWorkerName = `QA RVB Link Worker Second ${Date.now().toString(36)}`;
    const secondWorkerResult = await createHshWorkerThroughUi(page, secondWorkerName, "5550109002");
    const secondWorker = secondWorkerResult.worker;
    await page.goto("/rvb/workers", { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search workers by name, phone or @tag" }).fill(secondWorkerName);
    await page.getByRole("button", { name: `Link now ${secondWorkerName}` }).click();
    const linkDialog = page.getByRole("dialog").last();
    const secondAccountOption = linkDialog.getByRole("button", { name: new RegExp(secondAccountTag) });
    await expect(secondAccountOption).toBeVisible();
    await secondAccountOption.click();
    const linkResponsePromise = page.waitForResponse((response) =>
      response.url() === `${API_BASE}/api/rvb/accounts/${encodeURIComponent(secondAccount.body.account.id)}/link` && response.request().method() === "POST",
    );
    await linkDialog.getByRole("button", { name: /Link account/i }).click();
    const linkResponse = await linkResponsePromise;
    expect(linkResponse.status()).toBe(200);
    const linkedSupervisor = (await linkResponse.json()).account;
    expect(linkedSupervisor.linkedEntityType).toBe("worker");
    expect(linkedSupervisor.linkedEntityId).toBe(secondWorker.id);
    await expect(page.getByRole("heading", { name: "Link Existing Account", exact: true })).toBeHidden();
    await page.getByRole("dialog").last().getByRole("button", { name: "Close", exact: true }).last().click();
    await expect(page.locator("tr").filter({ hasText: secondWorkerName })).toContainText(secondAccountTag);

    // Simulate a stale linkable result returned just before another manager wins the same link race.
    const staleLinkableMatcher = (url) => {
      const parsed = new URL(url);
      return parsed.pathname === "/api/rvb/accounts/linkable" && parsed.searchParams.get("type") === "worker";
    };
    await page.route(staleLinkableMatcher, async (route) => {
      const upstream = await route.fetch();
      const body = await upstream.json();
      body.entities = [
        { id: linkedAccount.linkedEntityId, name: workerName, type: "worker" },
        ...(body.entities || []).filter((entity) => entity.id !== linkedAccount.linkedEntityId),
      ];
      await route.fulfill({ response: upstream, body: JSON.stringify(body) });
    });
    const duplicateEntityTag = uniqueTag("entity");
    const duplicateEntityDialog = await openAccountCreate(page, "Worker");
    const duplicateEntity = await finishAccountCreate(page, duplicateEntityDialog, {
      tag: duplicateEntityTag,
      password: TEMP_PASSWORD,
      entityName: workerName,
    });
    expect(duplicateEntity.response.status()).toBe(409);
    expect(duplicateEntity.body.code).toBe("RVB_ENTITY_ALREADY_LINKED");
    await expect(duplicateEntityDialog.getByRole("alert")).toContainText("This entity already has an RVB account");
    await duplicateEntityDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.unroute(staleLinkableMatcher);

    const immutableResponse = await request.patch(`${API_BASE}/api/rvb/accounts/${encodeURIComponent(linkedAccount.id)}`, {
      headers: { Authorization: `Bearer ${await latestManagerToken()}` },
      data: { tag: uniqueTag("mutated") },
    });
    expect(immutableResponse.status()).toBe(400);
    expect((await immutableResponse.json()).code).toBe("RVB_TAG_IMMUTABLE");

    await page.goto("/rvb/accounts", { waitUntil: "domcontentloaded" });
    const search = page.getByRole("searchbox", { name: "Search accounts" });
    await search.fill(workerTag);
    let row = page.locator("tr").filter({ hasText: workerTag }).first();
    await expect(row).toContainText(workerName);
    await row.getByRole("button", { name: `View ${workerName}` }).click();
    const details = page.getByRole("dialog").last();
    await expect(details).toContainText(workerTag);
    await expect(details).toContainText("Worker");
    await expect(details.getByRole("button", { name: /Delete Account/i })).toHaveCount(0);
    await details.getByRole("button", { name: "Archive", exact: true }).click();
    const archiveDialog = page.getByRole("dialog").last();
    const archiveConfirm = archiveDialog.getByRole("button", { name: "Archive", exact: true });
    await expect(archiveConfirm).toBeEnabled({ timeout: 8_000 });
    await archiveConfirm.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    row = page.locator("tr").filter({ hasText: workerTag }).first();
    await expect(row).toContainText("Archived");

    await row.getByRole("button", { name: `View ${workerName}` }).click();
    const archivedDetails = page.getByRole("dialog").last();
    await archivedDetails.getByRole("button", { name: "Reactivate", exact: true }).click();
    const reactivateDialog = page.getByRole("dialog").last();
    await reactivateDialog.getByRole("button", { name: "Reactivate", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    row = page.locator("tr").filter({ hasText: workerTag }).first();
    await expect(row).toContainText("Active");

    const deleteResponse = await request.delete(`${API_BASE}/api/rvb/accounts/${encodeURIComponent(linkedAccount.id)}`, {
      headers: { Authorization: `Bearer ${await latestManagerToken()}` },
    });
    expect(deleteResponse.status()).toBe(404);
    const unchanged = await request.get(`${API_BASE}/api/rvb/accounts/${encodeURIComponent(linkedAccount.id)}`, {
      headers: { Authorization: `Bearer ${await latestManagerToken()}` },
    });
    expect((await unchanged.json()).account.tag).toBe(workerTag);
    expect((await unchanged.json()).account.status).toBe("active");
  });

  test("H.S.H entity lifecycle owns portal eligibility and synchronizes R.V.B access", async ({ page, browser, request }) => {
    test.setTimeout(240_000);
    const manager = await signInAndLand(page, QA_USERS.manager.tag);
    const latestManagerToken = trackAccessToken(page, manager.accessToken);
    const configResponse = await request.patch(`${API_BASE}/api/rvb/config`, {
      headers: { Authorization: `Bearer ${await latestManagerToken()}` },
      data: { language: "en", currency: "DA", workerPositions: ["QA Butcher"], customerTypes: ["consumer", "business"] },
    });
    expect(configResponse.status()).toBe(200);

    const workerName = `QA HSH-Owned Worker ${Date.now().toString(36)}`;
    const hshWorker = await createHshWorkerThroughUi(page, workerName, "5550108101");
    const workerTag = uniqueTag("hshworker");
    const workerAccountDialog = await openAccountCreate(page, "Worker");
    const workerAccountCreate = await finishAccountCreate(page, workerAccountDialog, {
      tag: workerTag,
      password: TEMP_PASSWORD,
      entityName: workerName,
    });
    expect(workerAccountCreate.response.status()).toBe(201);
    const workerAccount = workerAccountCreate.body.account;
    expect(workerAccount.linkedEntityType).toBe("worker");
    expect(workerAccount.linkedEntityId).toBe(hshWorker.id);
    await expect(workerAccountDialog).toBeHidden();

    const portalContext = await browser.newContext({ baseURL: WEB_BASE });
    const portalPage = await portalContext.newPage();
    const firstPortalLogin = await submitLogin(portalPage, workerTag, TEMP_PASSWORD);
    expect(firstPortalLogin.response.status()).toBe(200);
    expect(firstPortalLogin.body.mustChangePassword).toBe(true);
    await expect(portalPage).toHaveURL(/\/rvb\/auth\/change-password$/);
    const refreshStatuses: number[] = [];
    portalPage.on("response", (response) => {
      if (response.url() === `${API_BASE}/api/rvb/auth/refresh`) refreshStatuses.push(response.status());
    });

    await archiveHshWorkerThroughUi(page, workerName, hshWorker.id);
    let currentAccount = await getRvbAccount(request, await latestManagerToken(), workerAccount.id);
    expect(currentAccount.status).toBe("archived");

    const archivedEntityDialog = await openAccountCreate(page, "Worker");
    const archivedLinkSelect = archivedEntityDialog.getByRole("button", { name: "Linked Entity", exact: true });
    await expect(archivedLinkSelect).toBeEnabled();
    await archivedLinkSelect.click();
    await expect(page.getByRole("option", { name: new RegExp(workerName) })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(archivedEntityDialog).toBeHidden();

    const archivedLinkableMatcher = (url) => {
      const parsed = new URL(url);
      return parsed.pathname === "/api/rvb/accounts/linkable" && parsed.searchParams.get("type") === "worker";
    };
    await page.route(archivedLinkableMatcher, async (route) => {
      const upstream = await route.fetch();
      const body = await upstream.json();
      body.entities = [
        { id: hshWorker.id, name: workerName, type: "worker" },
        ...(body.entities || []).filter((entity) => entity.id !== hshWorker.id),
      ];
      await route.fulfill({ response: upstream, body: JSON.stringify(body) });
    });
    const staleArchivedDialog = await openAccountCreate(page, "Worker");
    const archivedCreate = await finishAccountCreate(page, staleArchivedDialog, {
      tag: uniqueTag("archived"),
      password: TEMP_PASSWORD,
      entityName: workerName,
    });
    expect(archivedCreate.response.status()).toBe(409);
    expect(archivedCreate.body.code).toBe("RVB_LINKED_ENTITY_INACTIVE");
    await expect(staleArchivedDialog.getByRole("alert")).toContainText("Restore this H.S.H entity before granting portal access");
    await staleArchivedDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.unroute(archivedLinkableMatcher);

    const archiveRefreshStart = refreshStatuses.length;
    await portalPage.reload({ waitUntil: "domcontentloaded" });
    await expect(portalPage).toHaveURL(/\/rvb\/login$/);
    await expect.poll(() => refreshStatuses.length - archiveRefreshStart).toBe(1);
    expect(refreshStatuses.slice(archiveRefreshStart)).toEqual([401]);

    const loginWhileArchived = await submitLogin(portalPage, workerTag, TEMP_PASSWORD);
    expect(loginWhileArchived.response.status()).toBe(401);

    await restoreHshWorkerThroughUi(page, workerName, hshWorker.id);
    currentAccount = await getRvbAccount(request, await latestManagerToken(), workerAccount.id);
    expect(currentAccount.status).toBe("active");
    const restoredPortalLogin = await submitLogin(portalPage, workerTag, TEMP_PASSWORD);
    expect(restoredPortalLogin.response.status()).toBe(200);
    expect(restoredPortalLogin.body.mustChangePassword).toBe(true);
    await expect(portalPage).toHaveURL(/\/rvb\/auth\/change-password$/);

    await deleteHshWorkerThroughUi(page, workerName, hshWorker.id);
    currentAccount = await getRvbAccount(request, await latestManagerToken(), workerAccount.id);
    expect(currentAccount.status).toBe("disabled");
    expect(currentAccount.linkedEntityType).toBe("worker");
    expect(currentAccount.linkedEntityId).toBe(hshWorker.id);
    const deleteRefreshStart = refreshStatuses.length;
    await portalPage.reload({ waitUntil: "domcontentloaded" });
    await expect(portalPage).toHaveURL(/\/rvb\/login$/);
    await expect.poll(() => refreshStatuses.length - deleteRefreshStart).toBe(1);
    expect(refreshStatuses.slice(deleteRefreshStart)).toEqual([401]);
    expect((await submitLogin(portalPage, workerTag, TEMP_PASSWORD)).response.status()).toBe(401);
    await portalContext.close();

    const supplierName = `QA HSH-Owned Supplier ${Date.now().toString(36)}`;
    const hshSupplier = await createHshSupplierThroughUi(page, supplierName, "5550108201");
    const supplierTag = uniqueTag("hsup");
    const supplierDialog = await openAccountCreate(page, "Supplier");
    const supplierAccountCreate = await finishAccountCreate(page, supplierDialog, {
      tag: supplierTag,
      password: TEMP_PASSWORD,
      entityName: supplierName,
    });
    expect(supplierAccountCreate.response.status()).toBe(201);
    expect(supplierAccountCreate.body.account.linkedEntityId).toBe(hshSupplier.id);
    await expect(supplierDialog).toBeHidden();
    await deleteHshSupplierOrCustomerThroughUi(page, "supplier", supplierName, hshSupplier.id);
    const supplierAccount = await getRvbAccount(request, await latestManagerToken(), supplierAccountCreate.body.account.id);
    expect(supplierAccount.status).toBe("disabled");

    const customerName = `QA HSH-Owned Customer ${Date.now().toString(36)}`;
    const hshCustomer = await createHshCustomerThroughUi(page, customerName, "5550108301");
    const customerTag = uniqueTag("hcus");
    const customerDialog = await openAccountCreate(page, "Customer");
    const customerAccountCreate = await finishAccountCreate(page, customerDialog, {
      tag: customerTag,
      password: TEMP_PASSWORD,
      entityName: customerName,
    });
    expect(customerAccountCreate.response.status()).toBe(201);
    expect(customerAccountCreate.body.account.linkedEntityId).toBe(hshCustomer.id);
    await expect(customerDialog).toBeHidden();
    await deleteHshSupplierOrCustomerThroughUi(page, "customer", customerName, hshCustomer.id);
    const customerAccount = await getRvbAccount(request, await latestManagerToken(), customerAccountCreate.body.account.id);
    expect(customerAccount.status).toBe("disabled");
  });

  test("invalid R.V.B path returns a safe framework 404", async ({ page }) => {
    await signInAndLand(page, QA_USERS.manager.tag);
    const response = await page.goto("/rvb/this-phase1-route-does-not-exist", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(404);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByText(/Unhandled Runtime Error|Internal Server Error/i)).toHaveCount(0);
  });
});
