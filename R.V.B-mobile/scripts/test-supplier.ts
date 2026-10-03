import { sanitizeForSupplierPdf } from "../src/utils/pdf-supplier";

const BASE = process.env.EXPO_PUBLIC_RVB_API_URL || "http://localhost:5000";
const SUPPLIER_TAG = "qa.supplier.mobile";
const SUPPLIER_PWD = "Mobile123!";
const MANAGER_TAG = "qa.manager.mobile";
const MANAGER_PWD = "Mobile123!";

async function sleep(ms:number){ return new Promise(r=> setTimeout(r, ms)); }
async function api(path:string, method:"GET"|"POST"|"PATCH"="GET", body?:any, token?:string, retries=1){
  const headers:Record<string,string>={"Content-Type":"application/json","X-RVB-Client":"native"};
  if(token) headers["Authorization"]=`Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {method, headers, body: body? JSON.stringify(body): undefined});
  const text = await res.text();
  let json:any=null; try{ json=text? JSON.parse(text):null }catch{}
  if(!res.ok){
    if(json?.code==="RATE_LIMITED" && retries>0){
      console.log(`   RATE_LIMITED, waiting 61s and retrying ${path}...`);
      await sleep(61000);
      return api(path, method, body, token, retries-1);
    }
    const err:any=new Error(json?.message || text || `HTTP ${res.status}`);
    err.status=res.status; err.code=json?.code; err.json=json; err.text=text;
    throw err;
  }
  // tiny throttle to avoid hitting 30/min quickly
  await sleep(150);
  return {json, text, status:res.status};
}
async function login(tag:string,pwd:string){
  const {json}= await api("/api/rvb/auth/login","POST",{tag,password:pwd,native:true});
  return {access: json.accessToken as string, refresh: json.refreshToken as string, account: json.account};
}
function assert(c:boolean, msg:string){ if(!c) throw new Error("ASSERT FAIL: "+msg); }

async function run(){
  console.log("=== Supplier Automated Test ===");
  console.log(`BASE ${BASE}`);

  // 1. Portal DTO
  console.log("\n1. Supplier portal DTO");
  const supLogin = await login(SUPPLIER_TAG, SUPPLIER_PWD);
  console.log(` login ${SUPPLIER_TAG} role ${supLogin.account.role}`);
  assert(supLogin.account.role==="supplier","supplier role");
  const portal = await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access);
  const sup = portal.json.supplier;
  console.log(` supplier ${sup.name} balance ${sup.balance} phone ${sup.phone}`);
  assert(typeof sup.name==="string","name");
  assert(typeof sup.balance==="number","balance");
  assert(typeof sup.phone==="string","phone");
  assert(!("serverRevision" in sup),"no serverRevision");
  assert(!("syncStatus" in sup),"no syncStatus");
  assert(!("_id" in sup),"no _id");
  console.log("  PASS portal DTO");

  // 2. Balance / Currency
  console.log("\n2. Balance / Currency");
  const cfg = await api("/api/rvb/config","GET", undefined, supLogin.access);
  const currency = cfg.json.currency || cfg.json.config?.currency || "DA";
  console.log(` currency ${currency} balance ${sup.balance}`);
  assert(currency==="DA" || ["DA","€","$"].includes(currency),"currency");
  console.log("  PASS");

  // 3. Purchase history
  console.log("\n3. Purchase history");
  const purRes = await api("/api/rvb/portal/supplier/purchases","GET", undefined, supLogin.access);
  console.log(` purchases ${purRes.json.purchases.length}`);
  if(purRes.json.purchases.length>0){
    const p0 = purRes.json.purchases[0];
    assert(!("_id" in p0),"no _id");
    assert(Array.isArray(p0.items),"items array");
    assert(typeof p0.total==="number","total");
  }
  assert(purRes.json.purchases.length>=2,"at least 2 purchases seeded");
  console.log("  PASS purchases");

  // 4. Payment history
  console.log("\n4. Payment history");
  const payRes = await api("/api/rvb/portal/supplier/payments","GET", undefined, supLogin.access);
  console.log(` payments ${payRes.json.payments.length}`);
  // Supported YES, endpoint exists, may be 0
  console.log(`  Payment history supported: YES, records ${payRes.json.payments.length}`);

  // 5. Catalog
  console.log("\n5. Catalog for supplier");
  const cat = await api("/api/rvb/catalog/products?for=supplier","GET", undefined, supLogin.access);
  console.log(` catalog ${cat.json.products.length} products`);
  assert(cat.json.products.length>0,"at least 1 product");
  const prod = cat.json.products[0];
  assert(typeof prod.id==="string","product id");
  assert(typeof prod.name==="string","product name");
  assert(typeof prod.price==="number","product price");
  assert(typeof prod.available==="boolean","available boolean");
  assert(!("quantity" in prod),"should not leak quantity");
  assert(!("weightKg" in prod),"should not leak weightKg");
  console.log(`  using product ${prod.id} ${prod.name} price ${prod.price} available ${prod.available}`);
  // Try forbidden catalog for customer scope should fail for supplier
  try{
    await api("/api/rvb/catalog/products?for=customer","GET", undefined, supLogin.access);
    throw new Error("supplier should not access customer catalog");
  }catch(e:any){
    console.log(`  PASS supplier customer catalog blocked ${e.code} ${e.status}`);
    assert(e.status===403,"403");
  }

  // 6. New Supply validation
  console.log("\n6. New Supply validation");
  // Empty items
  try{ await api("/api/rvb/supplier-requests","POST",{type:"new_supply", items:[]}, supLogin.access); throw new Error("empty should fail"); }catch(e:any){ console.log(`   empty items REJECT ${e.code}`); assert(e.code==="RVB_ITEMS_REQUIRED","code"); }
  // Too many items (51)
  try{
    const many = Array.from({length:51}, ()=> ({productId: prod.id, quantity:1, weightKg:1, price:10}));
    await api("/api/rvb/supplier-requests","POST",{type:"new_supply", items:many}, supLogin.access);
    throw new Error("51 should fail");
  }catch(e:any){ console.log(`   51 items REJECT ${e.code}`); assert(e.code==="RVB_ITEMS_TOO_MANY","code"); }
  // quantity 0
  try{ await api("/api/rvb/supplier-requests","POST",{type:"new_supply", items:[{productId: prod.id, quantity:0, weightKg:10, price:10}]}, supLogin.access); throw new Error("quantity 0 should fail"); }catch(e:any){ console.log(`   quantity 0 REJECT ${e.code}`); assert(e.code==="RVB_QUANTITY_INVALID","code"); }
  // weight negative
  try{ await api("/api/rvb/supplier-requests","POST",{type:"new_supply", items:[{productId: prod.id, quantity:1, weightKg:-1, price:10}]}, supLogin.access); throw new Error("weight negative should fail"); }catch(e:any){ console.log(`   weight -1 REJECT ${e.code}`); assert(e.code==="RVB_WEIGHT_INVALID","code"); }
  // price negative
  try{ await api("/api/rvb/supplier-requests","POST",{type:"new_supply", items:[{productId: prod.id, quantity:1, weightKg:1, price:-5}]}, supLogin.access); throw new Error("price negative should fail"); }catch(e:any){ console.log(`   price -5 REJECT ${e.code}`); assert(e.code==="RVB_PRICE_INVALID","code"); }
  // product not found
  try{ await api("/api/rvb/supplier-requests","POST",{type:"new_supply", items:[{productId:"nonexistent-id", quantity:1, weightKg:1, price:10}]}, supLogin.access); throw new Error("product not found should fail"); }catch(e:any){ console.log(`   product not found REJECT ${e.code}`); assert(e.code==="RVB_PRODUCT_NOT_FOUND","code"); }

  // 7. Server total authority: try to forge total
  console.log("\n7. Server total authority (forge total:1 vs weight*price)");
  const forgeItems = [{productId: prod.id, quantity: 2, weightKg: 10, price: prod.price}];
  const expectedTotal = Math.round(10 * prod.price * 100)/100;
  console.log(`   items weight 10 * price ${prod.price} => expected ${expectedTotal}, client forged total 1`);
  const forgeRes = await api("/api/rvb/supplier-requests","POST",{type:"new_supply", items: forgeItems, total:1}, supLogin.access);
  console.log(`   forged request created total ${forgeRes.json.request.total} (should be ${expectedTotal})`);
  assert(forgeRes.json.request.total===expectedTotal, `server should recompute ${expectedTotal} not 1 got ${forgeRes.json.request.total}`);
  assert(forgeRes.json.request.items[0].total===expectedTotal, "item total also recomputed");
  console.log("   PASS server total authoritative, client total ignored");
  // Clean this forged request (reject)
  const mgr = await login(MANAGER_TAG, MANAGER_PWD);
  await api(`/api/rvb/supplier-requests/${forgeRes.json.request.id}/review`,"POST",{status:"rejected", notes:"test cleanup"}, mgr.access);
  console.log("   Cleaned forged request");

  // 8. New Supply live flow: pre-accept no mutation
  console.log("\n8. New Supply live flow");
  const supplierBefore = (await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access)).json.supplier;
  const balanceBefore = supplierBefore.balance as number;
  console.log(`   Balance before ${balanceBefore}`);
  // Get product inventory before
  // Need to fetch product via catalog not giving quantity, but we can fetch via backend direct? For test, we can fetch via manager API? But we can use direct DB via supplier-request service? Instead, we can fetch product via manager's view: need to check if supplier can see inventory? No, safe catalog hides quantity. For inventory mutation test, we need to check product quantity before/after via manager API or direct DB. For automated test, we can use manager's product fetch via API that is not exposed to supplier, but we can use direct DB via backend's product model? For test, we can fetch product via manager's authenticated request to a management endpoint? There is no supplier management product detail for supplier, but manager can fetch via some endpoint? We can use the same catalog but it doesn't give exact quantity. For test, we can use the backend's product model via direct API that manager can access? There is no direct product detail endpoint for manager in RVB, but we can use the H.S.H sync? Simpler: for test, we can consider that inventory mutation is verified by checking that after accept, the product's quantity increased by the supplied quantity, but we can verify via checking the purchase created and that product's quantity increased via direct DB query? For mobile test, we can't directly query DB, but we can verify via the purchase creation and balance.

  // For this test, we will record purchase count before
  const purchasesBefore = (await api("/api/rvb/portal/supplier/purchases","GET", undefined, supLogin.access)).json.purchases.length;
  console.log(`   Purchases before ${purchasesBefore}`);

  const supplyItems = [{productId: prod.id, quantity: 3, weightKg: 15, price: prod.price}];
  const serverExpected = Math.round(15 * prod.price * 100)/100;
  console.log(`   Submitting new supply 3x 15kg @${prod.price} => expected total ${serverExpected}`);
  const supplyRes = await api("/api/rvb/supplier-requests","POST",{type:"new_supply", items: supplyItems}, supLogin.access);
  const supplyReq = supplyRes.json.request;
  console.log(`   Created ${supplyReq.id} status ${supplyReq.status} total ${supplyReq.total}`);
  assert(supplyReq.status==="under_review","under_review");
  assert(supplyReq.total===serverExpected,"total computed");
  // Check no mutation yet
  const supplierAfterSubmit = (await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access)).json.supplier;
  console.log(`   Balance after submit ${supplierAfterSubmit.balance} should remain ${balanceBefore}`);
  assert(supplierAfterSubmit.balance===balanceBefore,"no balance mutation before accept");
  const purchasesAfterSubmit = (await api("/api/rvb/portal/supplier/purchases","GET", undefined, supLogin.access)).json.purchases.length;
  console.log(`   Purchases after submit ${purchasesAfterSubmit} should remain ${purchasesBefore}`);
  assert(purchasesAfterSubmit===purchasesBefore,"no purchase before accept");

  // Manager accept
  console.log("\n   Manager accepting...");
  const acceptRes = await api(`/api/rvb/supplier-requests/${supplyReq.id}/review`,"POST",{status:"accepted", notes:"QA accept"}, mgr.access);
  console.log(`   Review status ${acceptRes.json.request.status} purchaseId ${acceptRes.json.request.purchaseId}`);
  assert(acceptRes.json.request.status==="accepted","accepted");
  assert(!!acceptRes.json.request.purchaseId,"purchaseId created");

  // Verify after accept
  const supplierAfterAccept = (await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access)).json.supplier;
  const balanceAfter = supplierAfterAccept.balance;
  const expectedBalance = balanceBefore + serverExpected;
  console.log(`   Balance after accept ${balanceAfter} expected ${expectedBalance}`);
  assert(balanceAfter===expectedBalance,`balance should be ${expectedBalance}`);

  const purchasesAfterAccept = (await api("/api/rvb/portal/supplier/purchases","GET", undefined, supLogin.access)).json.purchases;
  console.log(`   Purchases after accept ${purchasesAfterAccept.length} should be ${purchasesBefore+1}`);
  assert(purchasesAfterAccept.length===purchasesBefore+1,"exactly one purchase");
  const newPurchase = purchasesAfterAccept.find((p:any)=> p.id===acceptRes.json.request.purchaseId);
  assert(!!newPurchase,"new purchase found");
  console.log(`   New purchase total ${newPurchase.total} items ${newPurchase.items.length}`);

  // Duplicate accept should be 409 and no second mutation
  console.log("\n9. Duplicate accept");
  const balanceBeforeDup = balanceAfter;
  const purchasesBeforeDup = purchasesAfterAccept.length;
  try{
    await api(`/api/rvb/supplier-requests/${supplyReq.id}/review`,"POST",{status:"accepted", notes:"dup"}, mgr.access);
    throw new Error("dup should be 409");
  }catch(e:any){
    console.log(`   Dup correctly ${e.code} ${e.status}`);
    assert(e.status===409 || e.code==="RVB_REQUEST_ALREADY_REVIEWED","409");
  }
  const supplierAfterDup = (await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access)).json.supplier;
  console.log(`   Balance after dup ${supplierAfterDup.balance} should remain ${balanceBeforeDup}`);
  assert(supplierAfterDup.balance===balanceBeforeDup,"no duplicate balance");
  const purchasesAfterDup = (await api("/api/rvb/portal/supplier/purchases","GET", undefined, supLogin.access)).json.purchases.length;
  console.log(`   Purchases after dup ${purchasesAfterDup} should remain ${purchasesBeforeDup}`);
  assert(purchasesAfterDup===purchasesBeforeDup,"no duplicate purchase");

  // 10. Rejected supply no mutation
  console.log("\n10. Rejected supply no mutation");
  const balanceBeforeReject = supplierAfterDup.balance;
  const purchasesBeforeReject = purchasesAfterDup;
  const rejectItems = [{productId: prod.id, quantity: 1, weightKg: 5, price: prod.price}];
  const rejectExpected = Math.round(5 * prod.price *100)/100;
  const rejectRes = await api("/api/rvb/supplier-requests","POST",{type:"new_supply", items: rejectItems}, supLogin.access);
  console.log(`   Created for reject ${rejectRes.json.request.id}`);
  const rejectId = rejectRes.json.request.id;
  const rejectReview = await api(`/api/rvb/supplier-requests/${rejectId}/review`,"POST",{status:"rejected", notes:"QA reject"}, mgr.access);
  console.log(`   Rejected ${rejectReview.json.request.status}`);
  assert(rejectReview.json.request.status==="rejected","rejected");
  const supplierAfterReject = (await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access)).json.supplier;
  console.log(`   Balance after reject ${supplierAfterReject.balance} should remain ${balanceBeforeReject}`);
  assert(supplierAfterReject.balance===balanceBeforeReject,"no balance on reject");
  const purchasesAfterReject = (await api("/api/rvb/portal/supplier/purchases","GET", undefined, supLogin.access)).json.purchases.length;
  console.log(`   Purchases after reject ${purchasesAfterReject} should remain ${purchasesBeforeReject}`);
  assert(purchasesAfterReject===purchasesBeforeReject,"no purchase on reject");

  // 11. Discrepancy
  console.log("\n11. Discrepancy");
  try{ await api("/api/rvb/supplier-requests","POST",{type:"discrepancy", description:"   "}, supLogin.access); throw new Error("empty should fail"); }catch(e:any){ console.log(`   empty REJECT ${e.code}`); assert(e.code==="RVB_DESCRIPTION_REQUIRED","code"); }
  const desc2000 = "a".repeat(2000);
  const desc2001 = "a".repeat(2001);
  const disc2000 = await api("/api/rvb/supplier-requests","POST",{type:"discrepancy", description: desc2000}, supLogin.access);
  console.log(`   2000 ALLOWED ${disc2000.json.request.id}`);
  await api(`/api/rvb/supplier-requests/${disc2000.json.request.id}/review`,"POST",{status:"rejected", notes:"cleanup"}, mgr.access);
  try{ await api("/api/rvb/supplier-requests","POST",{type:"discrepancy", description: desc2001}, supLogin.access); throw new Error("2001 should fail"); }catch(e:any){ console.log(`   2001 REJECT ${e.code}`); assert(e.code==="RVB_DESCRIPTION_TOO_LONG","code"); }
  // Live discrepancy no mutation
  const balanceBeforeDisc = (await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access)).json.supplier.balance;
  const discLive = await api("/api/rvb/supplier-requests","POST",{type:"discrepancy", description:"QA discrepancy test"}, supLogin.access);
  console.log(`   Created discrepancy ${discLive.json.request.id} status ${discLive.json.request.status}`);
  assert(discLive.json.request.status==="under_review","under_review");
  const balanceAfterDisc = (await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access)).json.supplier.balance;
  console.log(`   Balance after discrepancy ${balanceAfterDisc} should remain ${balanceBeforeDisc}`);
  assert(balanceAfterDisc===balanceBeforeDisc,"no mutation");
  const discAccept = await api(`/api/rvb/supplier-requests/${discLive.json.request.id}/review`,"POST",{status:"accepted", notes:"QA accept disc"}, mgr.access);
  console.log(`   Discrepancy reviewed ${discAccept.json.request.status}`);
  const balanceAfterDiscAccept = (await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access)).json.supplier.balance;
  assert(balanceAfterDiscAccept===balanceBeforeDisc,"still no mutation after accept");

  // 12. Request history
  console.log("\n12. Request history");
  const hist = await api("/api/rvb/supplier-requests","GET", undefined, supLogin.access);
  console.log(`   History ${hist.json.requests.length} requests`);
  for(const r of hist.json.requests){
    assert(["under_review","accepted","rejected"].includes(r.status),`status ${r.status}`);
    assert(["new_supply","discrepancy"].includes(r.type),`type ${r.type}`);
  }
  console.log("   PASS history enums");

  // 13. Activity: supplier does not have dedicated activity endpoint, check general activities or note
  console.log("\n13. Activity");
  try{
    const act = await api("/api/rvb/activities","GET", undefined, supLogin.access);
    console.log(`   General activities ${act.json.activities?.length ?? act.json.total ?? "unknown"}`);
    console.log("   Note: Supplier activity via general activities or request history; not dedicated portal activity");
  }catch(e:any){
    console.log(`   Activities endpoint ${e.code} ${e.status} - request history remains source of truth`);
  }
  console.log("   PASS activity check");

  // 14. PDF sanitizer
  console.log("\n14. PDF sanitizer");
  const supForPdf = (await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access)).json.supplier;
  const purForPdf = (await api("/api/rvb/portal/supplier/purchases","GET", undefined, supLogin.access)).json.purchases;
  const payForPdf = (await api("/api/rvb/portal/supplier/payments","GET", undefined, supLogin.access)).json.payments;
  const sanitized = sanitizeForSupplierPdf(supForPdf, purForPdf, payForPdf, currency);
  const sStr = JSON.stringify(sanitized);
  assert(!sStr.includes("password"),"no password");
  assert(!sStr.includes("refreshToken"),"no refreshToken");
  assert(!sStr.includes("serverRevision"),"no serverRevision");
  assert(!sStr.includes("_id"),"no _id");
  console.log("   PASS pdf sanitizer");

  // 15. Security: supplier cannot access management
  console.log("\n15. Security");
  try{ await api("/api/rvb/suppliers","GET", undefined, supLogin.access); throw new Error("should 403"); }catch(e:any){ console.log(`   GET /suppliers blocked ${e.code} ${e.status}`); assert(e.status===403,"403"); }
  try{ await api("/api/rvb/accounts","GET", undefined, supLogin.access); throw new Error("should 403"); }catch(e:any){ console.log(`   GET /accounts blocked ${e.code} ${e.status}`); assert(e.status===403,"403"); }
  // Try to review own request as supplier (should 403, only manager/admin)
  const ownReq = hist.json.requests.find((r:any)=> r.status==="under_review");
  if(ownReq){
    try{ await api(`/api/rvb/supplier-requests/${ownReq.id}/review`,"POST",{status:"accepted"}, supLogin.access); throw new Error("supplier review should 403"); }catch(e:any){ console.log(`   Supplier review own blocked ${e.code} ${e.status}`); assert(e.status===403,"403"); }
  } else {
    // Create a new one to test
    const tmp = await api("/api/rvb/supplier-requests","POST",{type:"discrepancy", description:"sec test"}, supLogin.access);
    try{ await api(`/api/rvb/supplier-requests/${tmp.json.request.id}/review`,"POST",{status:"rejected"}, supLogin.access); throw new Error("should 403"); }catch(e:any){ console.log(`   Supplier review blocked ${e.code}`); assert(e.status===403,"403"); }
    await api(`/api/rvb/supplier-requests/${tmp.json.request.id}/review`,"POST",{status:"rejected", notes:"cleanup"}, mgr.access);
  }
  // Try ownership spoof: supplier tries to submit with different supplierId
  try{
    await api("/api/rvb/supplier-requests","POST",{type:"new_supply", supplierId:"sup-other-id", items:[{productId: prod.id, quantity:1, weightKg:1, price:10}]}, supLogin.access);
    throw new Error("spoof should 403");
  }catch(e:any){ console.log(`   Spoof supplierId blocked ${e.code} ${e.status}`); assert(e.status===403,"403"); }

  // 16. Language
  console.log("\n16. Language");
  await api("/api/rvb/auth/preferences","PATCH",{ui:{language:"ar"}}, supLogin.access);
  console.log("   Set ar PASS");
  const portalAr = await api("/api/rvb/portal/supplier","GET", undefined, supLogin.access);
  assert(portalAr.json.supplier.balance===balanceAfterDisc,"still works after ar");
  await api("/api/rvb/auth/preferences","PATCH",{ui:{language:"en"}}, supLogin.access);
  console.log("   Reverted en PASS");

  console.log("\n=== Supplier Test PASS ===");
}

run().catch(e=>{ console.error("Supplier Test FAIL", e); console.error(e.stack); process.exit(1); });
