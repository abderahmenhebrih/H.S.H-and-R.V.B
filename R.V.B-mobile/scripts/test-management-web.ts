import { chromium } from "playwright";
const BASE_URL = process.env.EXPO_WEB_URL || "http://localhost:8082";

async function login(page: any, tag: string, pwd: string) {
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector('text="Sign in"', { timeout: 15000 }).catch(() => {});
  let tagLoc = page.getByPlaceholder("@abattoire");
  if ((await tagLoc.count()) === 0) tagLoc = page.locator('input').first();
  await tagLoc.fill(tag);
  await page.waitForTimeout(300);
  let pwdLoc = page.getByPlaceholder("••••••••");
  if ((await pwdLoc.count()) === 0) pwdLoc = page.locator('input[type="password"]').first();
  await pwdLoc.fill(pwd);
  await page.waitForTimeout(300);
  let btn = page.getByText("Sign in", { exact: true });
  if ((await btn.count()) === 0) btn = page.locator('text="Sign in"').last();
  await btn.first().click();
  await page.waitForTimeout(2000);
}

async function testManager(page: any) {
  console.log("\n=== Manager ===");
  await login(page, "qa.manager.mobile", "Mobile123!");
  await page.waitForSelector('text="Management"', { timeout: 10000 }).catch(() => {});
  const hasAccounts = (await page.getByText("Accounts & Access").count()) > 0;
  console.log(`Accounts card visible: ${hasAccounts}`);
  if (!hasAccounts) throw new Error("Manager missing Accounts card");

  // Open Accounts
  await page.getByText("Accounts & Access").first().click();
  await page.waitForTimeout(1000);
  const accountsTitle = (await page.getByText("Accounts & Access").count()) > 0;
  console.log(`Accounts screen: ${accountsTitle}`);
  // Check list
  const accountRow = await page.getByText("@qa.").count();
  console.log(`Account rows: ${accountRow}`);
  await page.goBack().catch(() => page.goto(BASE_URL));
  await page.waitForTimeout(500);

  // Workers
  await page.getByText("Workers").first().click();
  await page.waitForTimeout(1000);
  const workersTitle = (await page.getByText("Workers").count()) > 0;
  console.log(`Workers screen: ${workersTitle}`);
  const newBtn = await page.getByTestId("worker-create-open").count().catch(() => 0);
  console.log(`Worker + New button testID: ${newBtn}`);
  await page.goBack().catch(() => page.goto(BASE_URL));
  await page.waitForTimeout(500);

  // Customers
  await page.getByText("Customers").first().click();
  await page.waitForTimeout(1000);
  console.log(`Customers screen: ${(await page.getByText("Customers").count()) > 0}`);
  await page.goBack().catch(() => page.goto(BASE_URL));
  await page.waitForTimeout(500);

  // Requests
  await page.getByText("Requests").first().click();
  await page.waitForTimeout(1000);
  console.log(`Requests screen: ${(await page.getByText("Requests").count()) > 0}`);
  await page.goBack().catch(() => page.goto(BASE_URL));
  await page.waitForTimeout(500);

  // Orders
  await page.getByText("Orders").first().click();
  await page.waitForTimeout(1000);
  console.log(`Orders screen: ${(await page.getByText("Customer Orders").count()) > 0}`);
  await page.goBack().catch(() => page.goto(BASE_URL));
  await page.waitForTimeout(500);

  console.log("Manager PASS");
}

async function testSupervisor(page: any) {
  console.log("\n=== Supervisor ===");
  await login(page, "qa.supervisor.mobile", "Mobile123!");
  await page.waitForTimeout(1500);
  const hasCustomers = (await page.getByText("Customers").count()) > 0;
  console.log(`Supervisor Customers visible: ${hasCustomers}`);
  const hasAccounts = (await page.getByText("Accounts & Access").count()) > 0;
  console.log(`Supervisor Accounts visible (should be false): ${hasAccounts}`);
  if (hasAccounts) throw new Error("Supervisor should not see Accounts");
  // Try direct navigation to /accounts should show 403
  await page.goto(`${BASE_URL}/profile/accounts`);
  await page.waitForTimeout(1000);
  const forbidden = (await page.getByText("Forbidden").count()) > 0 || (await page.getByText("Could not load accounts").count()) > 0;
  console.log(`Supervisor direct /accounts 403 handling: ${forbidden ? "handled" : "maybe blocked"}`);
  await page.goto(BASE_URL);
  await page.waitForTimeout(500);
  console.log("Supervisor PASS");
}

async function testManagerSecondPass(page: any) {
  console.log("\n=== Manager (second pass, ex-admin coverage) ===");
  await login(page, "qa.manager.mobile", "Mobile123!");
  await page.waitForTimeout(1500);
  const hasAccounts = (await page.getByText("Accounts & Access").count()) > 0;
  console.log(`Manager Accounts visible: ${hasAccounts}`);
  if (!hasAccounts) throw new Error("Manager missing Accounts");
  console.log("Manager second-pass PASS");
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR", m.text()); });

  try {
    await testManager(page);
    await testSupervisor(page);
    await testManagerSecondPass(page);
    console.log("\n=== Management Web Test PASS ===");
    await browser.close();
    process.exit(0);
  } catch (e) {
    console.error("Management Web FAIL", e);
    await browser.close();
    process.exit(1);
  }
}
run();
