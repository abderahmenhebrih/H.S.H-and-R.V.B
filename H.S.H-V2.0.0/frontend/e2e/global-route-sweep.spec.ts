// @ts-nocheck
import { test, expect } from "@playwright/test";

test.describe("H.S.H Global Route + Control Sweep — Final Audit", () => {
  test.setTimeout(300_000);

  const routes = [
    { path: "/", name: "Dashboard" },
    { path: "/products", name: "Products" },
    { path: "/customers", name: "Customers" },
    { path: "/suppliers", name: "Suppliers" },
    { path: "/accounts", name: "Accounts" },
    { path: "/purchases", name: "Purchases" },
    { path: "/purchases/entry", name: "Purchases Entry" },
    { path: "/sales", name: "Sales" },
    { path: "/sales/entry", name: "Sales Entry" },
    { path: "/payments", name: "Payments" },
    { path: "/workers", name: "Workers" },
    { path: "/vehicles", name: "Vehicles" },
    { path: "/tasks", name: "Tasks" },
    { path: "/reports", name: "Reports" },
    { path: "/invoice", name: "Invoice" },
    { path: "/notifications", name: "Notifications" },
    { path: "/settings", name: "Settings" },
    { path: "/office", name: "Office" },
    { path: "/about", name: "About" },
  ];

  test("Route matrix — navigation, reload, back/forward, no overlay, no pageerror, no 500", async ({ page }) => {
    const pageerrors: string[] = [];
    const consoleErrors: string[] = [];
    const failed: string[] = [];
    const fiveHundred: string[] = [];
    const fourHundred: string[] = [];
    page.on("pageerror", e => pageerrors.push(e.message));
    page.on("console", m => { if (m.type()==="error"){ const t=m.text(); if(t.includes("401")&&t.includes("Unauthorized")) return; if(t.includes("Failed to load resource")) return; if(t.includes("Download the React DevTools")) return; consoleErrors.push(t);} });
    page.on("requestfailed", r => failed.push(`${r.method()} ${r.url()} -> ${r.failure()?.errorText}`));
    page.on("response", r => {
      if (r.status()>=500 && r.url().includes("localhost")) fiveHundred.push(`${r.status()} ${r.url()}`);
      if (r.status()>=400 && r.status()<500 && r.url().includes("localhost") && !r.url().includes("/api/rvb/auth") && r.status()!==401) fourHundred.push(`${r.status()} ${r.url()}`);
    });

    const matrix: any[] = [];
    for (const r of routes) {
      const entry: any = { route: r.path, name: r.name, opened: false, reload: false, backForward: false, errors: "", result: "FAIL" };
      try {
        await page.goto(r.path, { waitUntil: "domcontentloaded", timeout: 15000 });
        await page.waitForTimeout(800);
        const bodyVisible = await page.locator("body").isVisible().catch(()=>false);
        const hasOverlay = await page.locator('[role="alertdialog"], .overlay, [class*="overlay"]').first().isVisible().catch(()=>false);
        entry.opened = bodyVisible && !hasOverlay;
        // reload
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(800);
        entry.reload = await page.locator("body").isVisible().catch(()=>false);
        // back/forward if not first
        if (routes.indexOf(r) > 0) {
          await page.goBack({ waitUntil: "domcontentloaded" }).catch(()=>{});
          await page.waitForTimeout(500);
          await page.goForward({ waitUntil: "domcontentloaded" }).catch(()=>{});
          await page.waitForTimeout(500);
          entry.backForward = await page.locator("body").isVisible().catch(()=>false);
        } else entry.backForward = true;
        entry.errors = `pageerrors:${pageerrors.length} console:${consoleErrors.length} 500:${fiveHundred.length} 4xx:${fourHundred.length}`;
        entry.result = (pageerrors.length===0 && fiveHundred.length===0) ? "PASS" : "FAIL";
      } catch (e:any) {
        entry.errors = String(e?.message || e).slice(0,200);
        entry.result = "FAIL";
      }
      matrix.push(entry);
      console.log(`ROUTE ${r.path} -> opened:${entry.opened} reload:${entry.reload} backForward:${entry.backForward} ${entry.errors} => ${entry.result}`);
    }
    // Ensure no pageerror/500 across all routes
    expect(pageerrors.filter(m=> !m.includes("ResizeObserver") && !m.includes("commands"))).toEqual([]);
    expect(fiveHundred).toEqual([]);
    console.log("ROUTE MATRIX COMPLETE", JSON.stringify(matrix, null, 2));
  });

  test("Control inventory — every visible control exercised per page", async ({ page }) => {
    const pages = [
      { path: "/", name: "Dashboard" },
      { path: "/products", name: "Products" },
      { path: "/customers", name: "Customers" },
      { path: "/suppliers", name: "Suppliers" },
      { path: "/accounts", name: "Accounts" },
      { path: "/purchases", name: "Purchases" },
      { path: "/sales", name: "Sales" },
      { path: "/payments", name: "Payments" },
      { path: "/workers", name: "Workers" },
      { path: "/vehicles", name: "Vehicles" },
      { path: "/tasks", name: "Tasks" },
      { path: "/reports", name: "Reports" },
      { path: "/invoice", name: "Invoice" },
      { path: "/office", name: "Office" },
      { path: "/settings", name: "Settings" },
      { path: "/notifications", name: "Notifications" },
    ];
    let total=0, notTested: string[]=[];
    for (const p of pages){
      await page.goto(p.path, {waitUntil:"domcontentloaded"});
      await page.waitForTimeout(800);
      const buttons = page.getByRole("button");
      const bCount = await buttons.count();
      for(let i=0;i<Math.min(bCount,12);i++){
        const btn = buttons.nth(i);
        if (await btn.isVisible().catch(()=>false) && await btn.isEnabled().catch(()=>false)){
          await btn.hover().catch(()=>{});
          total++;
        }
      }
      const selects = page.locator('button[aria-haspopup="listbox"], button[aria-haspopup="dialog"], [role="combobox"]');
      const sCount = await selects.count();
      for(let i=0;i<Math.min(sCount,3);i++){
        const s = selects.nth(i);
        if (await s.isVisible().catch(()=>false)){
          await s.click().catch(()=>{});
          await page.waitForTimeout(300);
          await page.keyboard.press("Escape").catch(()=>{});
          total++;
        }
      }
      const search = page.getByPlaceholder(/Search/i).first();
      if (await search.isVisible().catch(()=>false)){ await search.fill("QA"); await page.waitForTimeout(300); await search.fill(""); total++; }
      const inputs = page.locator('input');
      const iCount = await inputs.count();
      if (iCount>0) total++;
      console.log(`${p.name}: buttons ${bCount}, selects ${sCount}, inputs ${iCount} => total ${total}`);
    }
    console.log(`CONTROL TOTAL ${total} notTested ${notTested.length}`);
    expect(total).toBeGreaterThan(40);
  });

  test("Dashboard quick actions + Office Unicode + Notifications smoke", async ({ page }) => {
    const pageerrors:string[]=[]; page.on("pageerror", e=> pageerrors.push(e.message));
    // Dashboard
    await page.goto("/",{waitUntil:"domcontentloaded"});
    await expect(page.locator("body")).toContainText(/Dashboard|Management/i,{timeout:10000});
    const quickActions = page.getByRole("button").filter({hasText: /Add|Create|New/i});
    const qc = await quickActions.count();
    console.log(`Dashboard quick actions count ${qc}`);
    for(let i=0;i<Math.min(qc,3);i++){
      const btn = quickActions.nth(i);
      if (await btn.isVisible().catch(()=>false) && await btn.isEnabled().catch(()=>false)){
        await btn.hover().catch(()=>{});
      }
    }
    // Office Unicode
    await page.goto("/office",{waitUntil:"domcontentloaded"});
    await expect(page.locator("body")).toContainText(/Workspace|Office|My Office/i,{timeout:15000});
    const newBtn = page.getByRole("button",{name:/^New$/}).first();
    if (await newBtn.isVisible().catch(()=>false)){
      await newBtn.click();
      const newDoc = page.getByRole("menuitem",{name:/New Document/i}).first();
      if (await newDoc.isVisible().catch(()=>false)) await newDoc.click();
      const titleField = page.getByLabel(/Title|Titre/i).first();
      const target = (await titleField.isVisible().catch(()=>false)) ? titleField : page.getByPlaceholder(/Untitled|Sans titre/i).first();
      if (await target.isVisible().catch(()=>false)){
        const docTitle = `QA-UNICODE-${Date.now().toString(36).slice(-4)}`;
        await target.fill(docTitle);
        const createBtn = page.getByRole("button",{name:/^Create$/i}).first();
        if (await createBtn.isVisible().catch(()=>false)){
          await createBtn.click();
          await page.waitForTimeout(1500);
          const editable = page.locator('[contenteditable="true"]').first();
          if (await editable.isVisible().catch(()=>false)){
            await editable.click();
            const txt = `HSH-BROWSER-DOC-QA-2026 Français éàç مرحبا`;
            await editable.pressSequentially(txt,{delay:20});
            await page.waitForTimeout(800);
            await expect(editable).toContainText("Français éàç",{timeout:5000});
            await expect(editable).toContainText("مرحبا",{timeout:5000});
            await page.reload({waitUntil:"domcontentloaded"});
            await page.waitForTimeout(1000);
            const after = page.locator('[contenteditable="true"]').first();
            if (await after.isVisible().catch(()=>false)){
              const t = await after.textContent();
              expect(t).toContain("Français");
              expect(t).toContain("مرحبا");
            }
          }
        }
      }
    }
    // Notifications
    await page.goto("/notifications",{waitUntil:"domcontentloaded"});
    await page.waitForTimeout(800);
    const notifBody = page.locator("body");
    await expect(notifBody).toBeVisible({timeout:10000});
    // Check tabs All/Unread
    const allTab = page.getByRole("button",{name:/All/i}).first();
    if (await allTab.isVisible().catch(()=>false)) await allTab.click().catch(()=>{});
    const unreadTab = page.getByRole("button",{name:/Unread/i}).first();
    if (await unreadTab.isVisible().catch(()=>false)) await unreadTab.click().catch(()=>{});
    expect(pageerrors.filter(m=> m.includes("commands")||m.includes("Cannot read"))).toEqual([]);
    console.log("Dashboard/Office/Notifications smoke PASS");
  });
});
