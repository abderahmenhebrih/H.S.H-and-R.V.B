import { chromium } from "playwright";

const BASE_URL = process.env.EXPO_WEB_URL || "http://localhost:8082";
const API_URL = process.env.EXPO_PUBLIC_RVB_API_URL || "http://localhost:5000";

async function run(){
  console.log(`Testing Worker web at ${BASE_URL} (API ${API_URL})`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let pageErrors: any[] = [];
  let consoleErrors: string[] = [];
  let failedRequests: string[] = [];

  page.on("pageerror", e=> { console.log("PAGEERROR", e.message); pageErrors.push(e.message); });
  page.on("console", msg=> { console.log(`CONSOLE ${msg.type()}`, msg.text()); if(msg.type()==="error") consoleErrors.push(msg.text()); });
  page.on("request", req=> { console.log("REQ", req.method(), req.url()); });
  page.on("response", resp=> { console.log("RES", resp.status(), resp.url()); if(resp.status()>=500){ console.log("FAILED 5xx", resp.url(), resp.status()); failedRequests.push(`${resp.url()} ${resp.status()}`);} });

  console.log("Goto", BASE_URL);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  // Wait for login screen
  console.log("Waiting for login...");
  await page.waitForSelector('text="Sign in"', { timeout: 30000 }).catch(()=>{});
  await page.waitForSelector('text="Poultry Business Suite"', { timeout: 15000 }).catch(()=>{});
  // Check login form exists
  const tagInput = await page.locator('input[placeholder*="@"]').first().count().then(c=>c);
  console.log(`Tag input count ${tagInput}`);
  // Alternative: find by placeholder
  let tagLocator = page.getByPlaceholder("@abattoire");
  if(await tagLocator.count()===0){
    // try generic input
    tagLocator = page.locator('input').first();
  }
  console.log("Filling tag...");
  await tagLocator.fill("qa.worker.mobile", { timeout: 10000 }).catch(async()=>{ await page.locator('input').first().fill("qa.worker.mobile"); });
  await page.waitForTimeout(500);
  // Debug: evaluate direct fetch to backend
  try{
    const health = await page.evaluate(async ()=> {
      try{
        const r = await fetch("http://localhost:5000/api/health");
        const t = await r.text();
        return `health ${r.status} ${t.slice(0,100)}`;
      }catch(e:any){ return `health fetch failed ${e.message}`;}
    });
    console.log("Direct fetch health via browser:", health);
  }catch(e:any){ console.log("evaluate health failed", e.message); }

  // Find password input (placeholder ••••)
  let pwdLocator = page.getByPlaceholder("••••••••");
  if(await pwdLocator.count()===0) pwdLocator = page.locator('input[type="password"]').first();
  console.log("Filling password...");
  await pwdLocator.fill("Mobile123!");
  await page.waitForTimeout(500);

  // Click Sign in
  console.log("Clicking Sign in...");
  // Use exact match to avoid header "R.V.B — Sign in"
  let signInBtn = page.getByText("Sign in", { exact: true });
  if(await signInBtn.count()===0) signInBtn = page.locator('text="Sign in"').last();
  await signInBtn.first().click({ timeout: 10000 }).catch(async()=> {
    console.log("Fallback click attempt");
    await page.locator('text="Sign in"').last().click({ timeout: 5000 }).catch(()=>{});
  });
  // Wait for login response
  try{
    const resp = await page.waitForResponse(r=> r.url().includes("/api/rvb/auth/login"), {timeout: 10000});
    console.log("Login response", resp.status(), await resp.text().then(t=> t.slice(0,500)).catch(()=> ""));
  }catch(e:any){ console.log("No login response captured", e.message); }

  // Wait for navigation to profile (should show Current Credit)
  console.log("Waiting for Worker dashboard...");
  try{
    await page.waitForSelector('text="Current Credit"', { timeout: 15000 });
    console.log("Found Current Credit");
  }catch{
    console.log("Current Credit not found, checking page content");
    console.log(await page.content().then(c=> c.slice(0,2000)));
  }

  // Verify worker name
  const nameVisible = await page.getByText("QA-WORKER-r484").count().then(c=>c>0);
  console.log(`Worker name visible: ${nameVisible}`);
  if(!nameVisible){
    console.log("Page content:", await page.content().then(c=> c.slice(0,3000)));
  }

  // Verify salary
  const salaryVisible = await page.getByText("Monthly Salary").count().then(c=>c>0);
  console.log(`Monthly Salary visible: ${salaryVisible}`);

  // Verify actions
  const paymentBtn = await page.getByText("Payment Request").count().then(c=>c);
  console.log(`Payment Request button count ${paymentBtn}`);

  // Test pull refresh not directly, but verify request history
  const requestHistory = await page.getByText("Request History").count().then(c=>c);
  console.log(`Request History visible: ${requestHistory>0}`);

  // Test activity
  const activity = await page.getByText("Activity Center").count().then(c=>c);
  console.log(`Activity Center visible: ${activity>0}`);

  // Test PDF button
  const pdfBtn = await page.getByText("Export Worker PDF").count().then(c=>c);
  console.log(`PDF button visible: ${pdfBtn>0}`);

  // Open Payment Request
  console.log("Opening Payment Request...");
  await page.getByText("Payment Request").first().click().catch(()=>{});
  await page.waitForTimeout(1000);
  // Check if payment screen loaded
  const paymentTitle = await page.getByText("Payment Request").count().then(c=>c);
  console.log(`Payment screen title count ${paymentTitle}`);
  // Try to find amount input
  const amountInput = await page.getByPlaceholder("e.g. 20000").count().then(c=>c);
  console.log(`Amount input visible: ${amountInput>0}`);
  // Go back
  await page.goBack().catch(()=> page.goto(BASE_URL));
  await page.waitForTimeout(500);

  // Open Loan
  console.log("Opening Loan Application...");
  await page.getByText("Loan Application").first().click().catch(()=>{});
  await page.waitForTimeout(1000);
  const loanVisible = await page.getByText("Loan Application").count().then(c=>c>0);
  console.log(`Loan visible: ${loanVisible}`);
  await page.goBack().catch(()=>{});

  // Open Discrepancy
  console.log("Opening Discrepancy...");
  await page.getByText("Discrepancy Report").first().click().catch(async()=> await page.getByText("Discrepancy").first().click());
  await page.waitForTimeout(1000);
  const discVisible = await page.getByText("Discrepancy Report").count().then(c=>c>0);
  console.log(`Discrepancy visible: ${discVisible}`);
  // Check counter 0/2000
  const counter = await page.getByText("0 / 2000").count().then(c=>c>0).catch(()=>false);
  console.log(`Counter 0/2000 visible: ${counter}`);
  await page.goBack().catch(()=>{});

  // Test language: go to settings tab
  console.log("Going to Settings...");
  // Tabs at bottom: Settings
  const settingsTab = page.getByText("Settings").last();
  await settingsTab.click().catch(()=>{});
  await page.waitForTimeout(1000);
  const langEn = await page.getByText("EN", {exact:true}).count().then(c=>c>0);
  console.log(`Language EN visible: ${langEn}`);
  // Switch to FR
  const frBtn = page.getByText("FR", {exact:true});
  if(await frBtn.count()>0){
    await frBtn.click();
    await page.waitForTimeout(1000);
    console.log("Switched to FR");
  }
  // Switch to AR
  const arBtn = page.getByText("AR", {exact:true});
  if(await arBtn.count()>0){
    await arBtn.click();
    await page.waitForTimeout(1000);
    console.log("Switched to AR");
    // Check RTL not broken: look for Poultry Business Suite still visible?
  }
  // Switch back to EN
  const enBtn = page.getByText("EN", {exact:true});
  if(await enBtn.count()>0){
    await enBtn.click();
    await page.waitForTimeout(500);
  }

  // Go back to profile
  const profileTab = page.getByText("Profile").last();
  await profileTab.click().catch(()=>{});
  await page.waitForTimeout(1000);

  // Test logout via settings
  console.log("Testing logout...");
  await settingsTab.click();
  await page.waitForTimeout(500);
  const signOutBtn = page.getByText("Sign out");
  if(await signOutBtn.count()>0){
    await signOutBtn.click();
    await page.waitForTimeout(500);
    // Confirm dialog: Sign out
    const confirm = page.getByText("Sign out").last();
    if(await confirm.count()>0){
      // Need to handle Alert: playwright may not handle native Alert, but expo web uses Alert.alert which is modal
      // Try to click
      await confirm.click().catch(()=>{});
    }
    await page.waitForTimeout(2000);
    const loginAgain = await page.getByText("Sign in").count().then(c=>c>0);
    console.log(`After logout, login visible: ${loginAgain}`);
  }

  // Final checks
  console.log("\n=== Browser Checks ===");
  console.log(`pageErrors ${pageErrors.length}`, pageErrors.slice(0,3));
  console.log(`consoleErrors ${consoleErrors.length}`, consoleErrors.slice(0,3));
  console.log(`failedRequests ${failedRequests.length}`, failedRequests.slice(0,3));

  const result = {
    pageErrors: pageErrors.length,
    consoleErrors: consoleErrors.length,
    failed500: failedRequests.length,
    workerNameVisible: nameVisible,
    pdfVisible: pdfBtn>0,
  };
  console.log("\nResult", JSON.stringify(result, null, 2));
  if(pageErrors.length>0) console.warn("WARN pageErrors detected");
  if(failedRequests.length>0) console.warn("WARN 5xx requests");
  if(!nameVisible) throw new Error("Worker name not visible - dashboard failed");
  if(pdfBtn===0) throw new Error("PDF button not visible");

  console.log("\n=== Worker Web Test PASS ===");
  await browser.close();
  process.exit(0);
}

run().catch(e=>{
  console.error("Worker Web Test FAIL", e);
  process.exit(1);
});
