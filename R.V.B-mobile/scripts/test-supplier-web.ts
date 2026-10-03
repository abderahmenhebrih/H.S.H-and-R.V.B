import { chromium } from "playwright";

const BASE_URL = process.env.EXPO_WEB_URL || "http://localhost:8082";
const API_URL = process.env.EXPO_PUBLIC_RVB_API_URL || "http://localhost:5000";

async function run(){
  console.log(`Testing Supplier web at ${BASE_URL}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let pageErrors:any[]=[];
  let consoleErrors:string[]=[];
  let failed500:string[]=[];
  page.on("pageerror", e=> { console.log("PAGEERROR", e.message); pageErrors.push(e.message); });
  page.on("console", msg=> { console.log(`CONSOLE ${msg.type()}`, msg.text()); if(msg.type()==="error") consoleErrors.push(msg.text()); });
  page.on("request", req=> {
    const url = req.url();
    if(url.includes("/portal/") || url.includes("/auth/")) console.log("REQ", req.method(), url, JSON.stringify(req.headers()).slice(0,300));
    else console.log("REQ", req.method(), url);
  });
  page.on("response", async resp=> {
    const url = resp.url();
    if(url.includes("/portal/supplier")){
      try{ const txt = await resp.text(); console.log("SUPPLIER RESP", resp.status(), txt.slice(0,500)); }catch{}
    }
    console.log("RES", resp.status(), url);
    if(resp.status()>=500) failed500.push(`${url} ${resp.status()}`);
  });

  console.log("Goto", BASE_URL);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  console.log("Waiting for login...");
  await page.waitForSelector('text="Sign in"', {timeout:30000}).catch(()=>{});
  await page.waitForSelector('text="Poultry Business Suite"', {timeout:15000}).catch(()=>{});

  let tagLocator = page.getByPlaceholder("@abattoire");
  if(await tagLocator.count()===0) tagLocator = page.locator('input').first();
  console.log("Filling tag qa.supplier.mobile");
  await tagLocator.fill("qa.supplier.mobile");
  await page.waitForTimeout(500);
  let pwdLocator = page.getByPlaceholder("••••••••");
  if(await pwdLocator.count()===0) pwdLocator = page.locator('input[type="password"]').first();
  console.log("Filling password");
  await pwdLocator.fill("Mobile123!");
  await page.waitForTimeout(500);
  let signInBtn = page.getByText("Sign in", {exact:true});
  if(await signInBtn.count()===0) signInBtn = page.locator('text="Sign in"').last();
  await signInBtn.first().click({timeout:10000});
  try{
    const resp = await page.waitForResponse(r=> r.url().includes("/api/rvb/auth/login"), {timeout:10000});
    console.log("Login response", resp.status(), await resp.text().then(t=> t.slice(0,300)).catch(()=> ""));
  }catch(e:any){ console.log("No login response", e.message); }
  await page.waitForTimeout(2000);
  console.log("URL after login", page.url());
  try{
    const ls = await page.evaluate(()=> {
      try{ return { refresh: localStorage.getItem("rvb.refreshToken"), all: JSON.stringify(localStorage).slice(0,500) }; }catch(e:any){ return {error: e.message}; }
    });
    console.log("localStorage", JSON.stringify(ls).slice(0,500));
  }catch(e:any){ console.log("localStorage eval failed", e.message); }
  try{
    const health = await page.evaluate(async()=> {
      try{
        const r = await fetch("http://localhost:5000/api/rvb/portal/supplier", {headers: {"Authorization": `Bearer ${localStorage.getItem("rvb.refreshToken") ? "test" : ""}`}});
        return `portal supplier via fetch ${r.status}`;
      }catch(e:any){ return `fetch failed ${e.message}`; }
    });
    console.log("Direct portal fetch via browser evaluate:", health);
  }catch(e:any){ console.log("evaluate portal failed", e.message); }

  console.log("Waiting for Supplier dashboard...");
  try{ await page.waitForSelector('text="Current Balance"', {timeout:15000}); console.log("Found Current Balance"); }catch{ 
    console.log("Current Balance not found");
    console.log("URL", page.url());
    console.log(await page.content().then(c=> c.slice(0,3000)));
    // Try to manually navigate to profile
    console.log("Trying manual goto profile...");
    await page.goto(BASE_URL + "/profile", {waitUntil:"domcontentloaded", timeout:10000}).catch(()=>{});
    await page.waitForTimeout(2000);
    console.log("After manual goto, URL", page.url());
    console.log(await page.content().then(c=> c.slice(0,3000)));
  }

  const nameVisible = await page.getByText("QA-SUP-r484").count().then(c=>c>0);
  console.log(`Supplier name visible: ${nameVisible}`);
  const balanceVisible = await page.getByText("Current Balance").count().then(c=>c>0);
  console.log(`Balance visible: ${balanceVisible}`);
  const purchasesVisible = await page.getByText("Purchase / Supply History").count().then(c=>c>0);
  console.log(`Purchase history visible: ${purchasesVisible}`);
  const paymentHistoryVisible = await page.getByText("Payment History").count().then(c=>c>0);
  console.log(`Payment history visible: ${paymentHistoryVisible}`);
  const newSupplyBtn = await page.getByText("New Supply").count().then(c=>c);
  console.log(`New Supply button count ${newSupplyBtn}`);
  const discrepancyBtn = await page.getByText("Discrepancy Report").count().then(c=>c);
  console.log(`Discrepancy button count ${discrepancyBtn}`);
  const pdfBtn = await page.getByText("Export Supplier PDF").count().then(c=>c);
  console.log(`PDF button visible: ${pdfBtn>0}`);

  // Open New Supply
  console.log("Opening New Supply...");
  await page.getByText("New Supply").first().click().catch(()=>{});
  await page.waitForTimeout(1000);
  const supplyTitle = await page.getByText("New Supply").count().then(c=>c);
  console.log(`Supply screen title count ${supplyTitle}`);
  const addProduct = await page.getByText("Add Product").count().then(c=>c>0);
  console.log(`Add Product visible: ${addProduct}`);
  await page.goBack().catch(()=> page.goto(BASE_URL));
  await page.waitForTimeout(500);

  // Open Discrepancy
  console.log("Opening Discrepancy...");
  await page.getByText("Discrepancy Report").first().click().catch(async()=> await page.getByText("Discrepancy").first().click());
  await page.waitForTimeout(1000);
  const discVisible = await page.getByText("Discrepancy Report").count().then(c=>c>0);
  console.log(`Discrepancy visible: ${discVisible}`);
  const counter = await page.getByText("0 / 2000").count().then(c=>c>0).catch(()=>false);
  console.log(`Counter visible: ${counter}`);
  await page.goBack().catch(()=>{});

  // Settings language
  console.log("Going to Settings...");
  const settingsTab = page.getByText("Settings").last();
  await settingsTab.click().catch(()=>{});
  await page.waitForTimeout(1000);
  const langEn = await page.getByText("EN", {exact:true}).count().then(c=>c>0);
  console.log(`Language EN visible: ${langEn}`);
  const frBtn = page.getByText("FR", {exact:true});
  if(await frBtn.count()>0){ await frBtn.click(); await page.waitForTimeout(1000); console.log("Switched to FR"); }
  const arBtn = page.getByText("AR", {exact:true});
  if(await arBtn.count()>0){ await arBtn.click(); await page.waitForTimeout(1000); console.log("Switched to AR"); }
  const enBtn = page.getByText("EN", {exact:true});
  if(await enBtn.count()>0){ await enBtn.click(); await page.waitForTimeout(500); }
  const profileTab = page.getByText("Profile").last();
  await profileTab.click().catch(()=>{});
  await page.waitForTimeout(1000);

  console.log("\n=== Browser Checks ===");
  console.log(`pageErrors ${pageErrors.length}`, pageErrors.slice(0,3));
  console.log(`consoleErrors ${consoleErrors.length}`, consoleErrors.slice(0,3));
  console.log(`failed500 ${failed500.length}`, failed500.slice(0,3));
  const result = { pageErrors: pageErrors.length, consoleErrors: consoleErrors.length, failed500: failed500.length, nameVisible, pdfVisible: pdfBtn>0 };
  console.log("\nResult", JSON.stringify(result, null,2));
  if(pageErrors.length>0) console.warn("WARN pageErrors");
  if(failed500.length>0) console.warn("WARN 500");
  if(!nameVisible) throw new Error("Supplier name not visible");
  if(pdfBtn===0) throw new Error("PDF button not visible");
  console.log("\n=== Supplier Web Test PASS ===");
  await browser.close();
  process.exit(0);
}
run().catch(e=>{ console.error("Supplier Web Test FAIL", e); process.exit(1); });
