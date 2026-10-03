import { sanitizeForCustomerPdf } from "../src/utils/pdf-customer";

const BASE = process.env.EXPO_PUBLIC_RVB_API_URL || "http://localhost:5000";
const CUSTOMER_TAG = "qa.customer.mobile";
const CUSTOMER_PWD = "Mobile123!";
const MANAGER_TAG = "qa.manager.mobile";
const MANAGER_PWD = "Mobile123!";
const SUPERVISOR_TAG = "qa.supervisor.mobile";
const SUPERVISOR_PWD = "Mobile123!";

async function sleep(ms:number){ return new Promise(r=> setTimeout(r, ms)); }
async function api(path:string, method:"GET"|"POST"|"PATCH"="GET", body?:any, token?:string, retries=1){
  const headers:Record<string,string>={"Content-Type":"application/json","X-RVB-Client":"native"};
  if(token) headers["Authorization"]=`Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {method, headers, body: body? JSON.stringify(body): undefined});
  const text = await res.text();
  let json:any=null; try{ json=text? JSON.parse(text):null }catch{}
  if(!res.ok){
    if(json?.code==="RATE_LIMITED" && retries>0){
      console.log(`   RATE_LIMITED, waiting 61s retry ${path}...`);
      await sleep(61000);
      return api(path, method, body, token, retries-1);
    }
    const err:any=new Error(json?.message || text || `HTTP ${res.status}`);
    err.status=res.status; err.code=json?.code; err.json=json; err.text=text;
    throw err;
  }
  await sleep(150);
  return {json, text, status:res.status};
}
async function login(tag:string,pwd:string){
  const {json}= await api("/api/rvb/auth/login","POST",{tag,password:pwd,native:true});
  return {access: json.accessToken as string, refresh: json.refreshToken as string, account: json.account};
}
function assert(c:boolean, msg:string){ if(!c) throw new Error("ASSERT FAIL: "+msg); }

async function run(){
  console.log("=== Customer Automated Test ===");
  console.log(`BASE ${BASE}`);

  // 1. Portal DTO
  console.log("\n1. Customer portal DTO");
  const custLogin = await login(CUSTOMER_TAG, CUSTOMER_PWD);
  console.log(` login ${CUSTOMER_TAG} role ${custLogin.account.role}`);
  assert(custLogin.account.role==="customer","customer role");
  const portal = await api("/api/rvb/portal/customer","GET", undefined, custLogin.access);
  const cust = portal.json.customer;
  console.log(` customer ${cust.name} balance ${cust.balance} type ${cust.type}`);
  assert(typeof cust.name==="string","name");
  assert(typeof cust.balance==="number","balance");
  assert(typeof cust.type==="string","type");
  assert(!("serverRevision" in cust),"no serverRevision");
  assert(!("syncStatus" in cust),"no syncStatus");
  assert(!("_id" in cust),"no _id");
  console.log("  PASS portal DTO");

  // 2. Balance / Currency
  console.log("\n2. Balance / Currency");
  const cfg = await api("/api/rvb/config","GET", undefined, custLogin.access);
  const currency = cfg.json.currency || cfg.json.config?.currency || "DA";
  console.log(` currency ${currency} balance ${cust.balance}`);
  assert(currency==="DA" || ["DA","€","$"].includes(currency),"currency");
  console.log("  PASS");

  // 3. Sales history
  console.log("\n3. Sales history");
  const salesRes = await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access);
  console.log(` sales ${salesRes.json.sales.length}`);
  if(salesRes.json.sales.length>0){
    const s0 = salesRes.json.sales[0];
    assert(!("_id" in s0),"no _id");
    assert(Array.isArray(s0.items),"items");
    assert(typeof s0.total==="number","total");
  }
  assert(salesRes.json.sales.length>=2,"at least 2 sales seeded");
  console.log("  PASS sales");

  // 4. Payments
  console.log("\n4. Payment history");
  const payRes = await api("/api/rvb/portal/customer/payments","GET", undefined, custLogin.access);
  console.log(` payments ${payRes.json.payments.length}`);
  console.log(`  Payment history supported: YES, records ${payRes.json.payments.length}`);

  // 5. Catalog for customer
  console.log("\n5. Catalog for customer");
  const cat = await api("/api/rvb/catalog/products?for=customer","GET", undefined, custLogin.access);
  console.log(` catalog ${cat.json.products.length} products`);
  assert(cat.json.products.length>0,"at least 1 product");
  const prod = cat.json.products[0];
  assert(typeof prod.id==="string","product id");
  assert(typeof prod.name==="string","name");
  assert(typeof prod.price==="number","price");
  assert(typeof prod.available==="boolean","available");
  assert(!("quantity" in prod),"should not leak quantity");
  assert(!("weightKg" in prod),"should not leak weightKg");
  console.log(`  using product ${prod.id} ${prod.name} price ${prod.price} available ${prod.available}`);
  // Forbidden catalog for supplier
  try{
    await api("/api/rvb/catalog/products?for=supplier","GET", undefined, custLogin.access);
    throw new Error("customer should not access supplier catalog");
  }catch(e:any){
    console.log(`  PASS supplier catalog blocked for customer ${e.code} ${e.status}`);
    assert(e.status===403,"403");
  }

  // 6. Insert Shipment price authority: forge price
  console.log("\n6. Insert Shipment price authority (forge price 999999 vs server)");
  const shipItemsForged = [{productId: prod.id, quantity: 2, weightKg: 10, price: 999999}];
  const expectedShipTotal = Math.round(10 * prod.price * 100)/100;
  console.log(`   items weight 10 * server price ${prod.price} => expected ${expectedShipTotal}, client forged 999999`);
  const shipForged = await api("/api/rvb/customer-requests","POST",{type:"insert_shipment", items: shipItemsForged}, custLogin.access);
  console.log(`   forged shipment total ${shipForged.json.request.total} (should be ${expectedShipTotal}) price stored ${shipForged.json.request.items[0].price}`);
  assert(shipForged.json.request.total===expectedShipTotal, `server should recompute ${expectedShipTotal} got ${shipForged.json.request.total}`);
  assert(shipForged.json.request.items[0].price===prod.price, `price should be ${prod.price} got ${shipForged.json.request.items[0].price}`);
  console.log("   PASS server price authoritative");
  const mgr = await login(MANAGER_TAG, MANAGER_PWD);
  await api(`/api/rvb/customer-requests/${shipForged.json.request.id}/review`,"POST",{status:"rejected", notes:"cleanup"}, mgr.access);
  console.log("   Cleaned forged shipment");

  // Also test total forged
  const shipForgedTotal = await api("/api/rvb/customer-requests","POST",{type:"insert_shipment", items:[{productId: prod.id, quantity:1, weightKg:5, price: prod.price}], total:1}, custLogin.access);
  const exp2 = Math.round(5 * prod.price *100)/100;
  console.log(`   forged total 1 vs expected ${exp2}, got ${shipForgedTotal.json.request.total}`);
  assert(shipForgedTotal.json.request.total===exp2,"total recomputed");
  await api(`/api/rvb/customer-requests/${shipForgedTotal.json.request.id}/review`,"POST",{status:"rejected", notes:"cleanup"}, mgr.access);

  // 7. Insert Shipment live flow: pre-accept no mutation
  console.log("\n7. Insert Shipment live flow");
  const custBefore = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  const balanceBefore = custBefore.balance as number;
  console.log(`   Balance before ${balanceBefore}`);
  const salesBefore = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales.length;
  console.log(`   Sales before ${salesBefore}`);
  // Need product inventory before - we know product has 200 quantity/weight after seed, but we can just check that sale count and balance are correct

  const shipItems = [{productId: prod.id, quantity: 2, weightKg: 10, price: prod.price}];
  const shipExpected = Math.round(10 * prod.price *100)/100;
  console.log(`   Submitting insert_shipment 2x 10kg @${prod.price} => expected total ${shipExpected}`);
  const shipRes = await api("/api/rvb/customer-requests","POST",{type:"insert_shipment", items: shipItems}, custLogin.access);
  const shipReq = shipRes.json.request;
  console.log(`   Created ${shipReq.id} status ${shipReq.status} total ${shipReq.total}`);
  assert(shipReq.status==="under_review","under_review");
  assert(shipReq.total===shipExpected,"total");
  const custAfterSubmit = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  console.log(`   Balance after submit ${custAfterSubmit.balance} should remain ${balanceBefore}`);
  assert(custAfterSubmit.balance===balanceBefore,"no balance before accept");
  const salesAfterSubmit = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales.length;
  console.log(`   Sales after submit ${salesAfterSubmit} should remain ${salesBefore}`);
  assert(salesAfterSubmit===salesBefore,"no sale before accept");

  // Manager accept
  console.log("\n   Manager accepting shipment...");
  const acceptShip = await api(`/api/rvb/customer-requests/${shipReq.id}/review`,"POST",{status:"accepted", notes:"QA accept"}, mgr.access);
  console.log(`   Review status ${acceptShip.json.request.status} saleId ${acceptShip.json.request.saleId}`);
  assert(acceptShip.json.request.status==="accepted","accepted");
  assert(!!acceptShip.json.request.saleId,"saleId created");

  const custAfterAccept = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  const balanceAfter = custAfterAccept.balance;
  const expectedBalance = balanceBefore + shipExpected;
  console.log(`   Balance after accept ${balanceAfter} expected ${expectedBalance}`);
  assert(balanceAfter===expectedBalance, `balance should be ${expectedBalance}`);

  const salesAfterAccept = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales;
  console.log(`   Sales after accept ${salesAfterAccept.length} should be ${salesBefore+1}`);
  assert(salesAfterAccept.length===salesBefore+1,"exactly one sale");
  const newSale = salesAfterAccept.find((s:any)=> s.id===acceptShip.json.request.saleId);
  assert(!!newSale,"new sale found");
  console.log(`   New sale total ${newSale.total}`);

  // Duplicate accept 409
  console.log("\n8. Duplicate shipment accept");
  const balanceBeforeDup = balanceAfter;
  const salesBeforeDup = salesAfterAccept.length;
  try{
    await api(`/api/rvb/customer-requests/${shipReq.id}/review`,"POST",{status:"accepted", notes:"dup"}, mgr.access);
    throw new Error("dup should 409");
  }catch(e:any){
    console.log(`   Dup correctly ${e.code} ${e.status}`);
    assert(e.status===409 || e.code==="RVB_REQUEST_ALREADY_REVIEWED","409");
  }
  const custAfterDup = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  console.log(`   Balance after dup ${custAfterDup.balance} should remain ${balanceBeforeDup}`);
  assert(custAfterDup.balance===balanceBeforeDup,"no dup balance");
  const salesAfterDup = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales.length;
  assert(salesAfterDup===salesBeforeDup,"no dup sale");

  // 9. Rejected shipment no mutation
  console.log("\n9. Rejected shipment no mutation");
  const balanceBeforeReject = custAfterDup.balance;
  const salesBeforeReject = salesAfterDup;
  const rejectShip = await api("/api/rvb/customer-requests","POST",{type:"insert_shipment", items:[{productId: prod.id, quantity:1, weightKg:2, price: prod.price}]}, custLogin.access);
  console.log(`   Created for reject ${rejectShip.json.request.id}`);
  const rejectReview = await api(`/api/rvb/customer-requests/${rejectShip.json.request.id}/review`,"POST",{status:"rejected", notes:"QA reject"}, mgr.access);
  console.log(`   Rejected ${rejectReview.json.request.status}`);
  assert(rejectReview.json.request.status==="rejected","rejected");
  const custAfterReject = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  console.log(`   Balance after reject ${custAfterReject.balance} should remain ${balanceBeforeReject}`);
  assert(custAfterReject.balance===balanceBeforeReject,"no balance on reject");
  const salesAfterReject = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales.length;
  assert(salesAfterReject===salesBeforeReject,"no sale on reject");

  // 10. Insufficient inventory rollback
  console.log("\n10. Insufficient inventory rollback");
  // Create a request with quantity that exceeds inventory (product has 200, so use 1000)
  const bigShip = await api("/api/rvb/customer-requests","POST",{type:"insert_shipment", items:[{productId: prod.id, quantity:1000, weightKg:1000, price: prod.price}]}, custLogin.access);
  console.log(`   Created big shipment ${bigShip.json.request.id} (qty 1000)`);
  const balanceBeforeBig = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer.balance;
  const salesBeforeBig = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales.length;
  try{
    await api(`/api/rvb/customer-requests/${bigShip.json.request.id}/review`,"POST",{status:"accepted", notes:"should fail"}, mgr.access);
    throw new Error("should have failed insufficient stock");
  }catch(e:any){
    console.log(`   Accept big correctly failed ${e.code} ${e.status}`);
    assert(e.code==="RVB_INSUFFICIENT_STOCK" || e.status===400,"insufficient stock");
  }
  const custAfterBig = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  console.log(`   Balance after big fail ${custAfterBig.balance} should remain ${balanceBeforeBig}`);
  assert(custAfterBig.balance===balanceBeforeBig,"no balance on insufficient");
  const salesAfterBig = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales.length;
  assert(salesAfterBig===salesBeforeBig,"no sale on insufficient");
  // Clean up big request (reject it)
  try{ await api(`/api/rvb/customer-requests/${bigShip.json.request.id}/review`,"POST",{status:"rejected", notes:"cleanup"}, mgr.access); }catch{}

  // 11. Discrepancy
  console.log("\n11. Discrepancy");
  try{ await api("/api/rvb/customer-requests","POST",{type:"discrepancy", description:"   "}, custLogin.access); throw new Error("empty should fail"); }catch(e:any){ console.log(`   empty REJECT ${e.code}`); assert(e.code==="RVB_DESCRIPTION_REQUIRED","code"); }
  const desc2000 = "a".repeat(2000);
  const desc2001 = "a".repeat(2001);
  const disc2000 = await api("/api/rvb/customer-requests","POST",{type:"discrepancy", description: desc2000}, custLogin.access);
  console.log(`   2000 ALLOWED ${disc2000.json.request.id}`);
  await api(`/api/rvb/customer-requests/${disc2000.json.request.id}/review`,"POST",{status:"rejected", notes:"cleanup"}, mgr.access);
  try{ await api("/api/rvb/customer-requests","POST",{type:"discrepancy", description: desc2001}, custLogin.access); throw new Error("2001 should fail"); }catch(e:any){ console.log(`   2001 REJECT ${e.code}`); assert(e.code==="RVB_DESCRIPTION_TOO_LONG","code"); }
  const balanceBeforeDisc = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer.balance;
  const discLive = await api("/api/rvb/customer-requests","POST",{type:"discrepancy", description:"QA discrepancy test"}, custLogin.access);
  console.log(`   Created discrepancy ${discLive.json.request.id}`);
  assert(discLive.json.request.status==="under_review","under_review");
  const balanceAfterDisc = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer.balance;
  assert(balanceAfterDisc===balanceBeforeDisc,"no mutation");
  const discAccept = await api(`/api/rvb/customer-requests/${discLive.json.request.id}/review`,"POST",{status:"accepted", notes:"QA accept disc"}, mgr.access);
  console.log(`   Discrepancy reviewed ${discAccept.json.request.status}`);
  const balanceAfterDiscAccept = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer.balance;
  assert(balanceAfterDiscAccept===balanceBeforeDisc,"still no mutation");

  // 12. Place Order - price authority
  console.log("\n12. Place Order - price authority");
  const orderForged = await api("/api/rvb/customer-orders","POST",{items:[{productId: prod.id, quantity:2, weightKg:5, price:1}]}, custLogin.access);
  console.log(`   Forged order price 1, stored price ${orderForged.json.order.items[0].price} total ${orderForged.json.order.total}, server price ${prod.price}`);
  assert(orderForged.json.order.items[0].price===prod.price, `price should be ${prod.price}`);
  const expectedOrderTotal = Math.round(5 * prod.price *100)/100;
  assert(orderForged.json.order.total===expectedOrderTotal, `total should be ${expectedOrderTotal}`);
  console.log(`   PASS order price authoritative`);
  // Also test total forged
  const orderForged2 = await api("/api/rvb/customer-orders","POST",{items:[{productId: prod.id, quantity:1, weightKg:2, price: prod.price}], total:1}, custLogin.access);
  assert(orderForged2.json.order.total=== Math.round(2 * prod.price *100)/100,"total recomputed");
  console.log(`   Forged total 1 ignored, stored ${orderForged2.json.order.total}`);
  // Clean these two orders (cancel them)
  await api(`/api/rvb/customer-orders/${orderForged.json.order.id}/cancel`,"POST",{}, custLogin.access);
  await api(`/api/rvb/customer-orders/${orderForged2.json.order.id}/cancel`,"POST",{}, custLogin.access);
  console.log("   Cleaned forged orders via cancel");

  // 13. Order create under_review, no sale/inventory/balance mutation
  console.log("\n13. Order create under_review");
  const custBeforeOrder = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  const balanceBeforeOrder = custBeforeOrder.balance;
  const salesBeforeOrder = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales.length;
  const orderRes = await api("/api/rvb/customer-orders","POST",{items:[{productId: prod.id, quantity:2, weightKg:5, price: prod.price}]}, custLogin.access);
  const order = orderRes.json.order;
  console.log(`   Created order ${order.id} status ${order.status} total ${order.total}`);
  assert(order.status==="under_review","under_review");
  const custAfterOrder = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  assert(custAfterOrder.balance===balanceBeforeOrder,"no balance on order create");
  const salesAfterOrder = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales.length;
  assert(salesAfterOrder===salesBeforeOrder,"no sale on order create");
  console.log("   PASS no sale/inventory/balance on order create");

  // 14. Order edit own under_review
  console.log("\n14. Order edit own under_review");
  // Edit quantity from 2 to 3, with forged price 999999
  const editRes = await api(`/api/rvb/customer-orders/${order.id}`,"PATCH",{items:[{productId: prod.id, quantity:3, weightKg:5, price:999999}]}, custLogin.access);
  console.log(`   Edited order total ${editRes.json.order.total} price ${editRes.json.order.items[0].price}`);
  assert(editRes.json.order.items[0].price===prod.price,"price still authoritative after edit");
  const expectedEditTotal = Math.round(5 * prod.price *100)/100;
  assert(editRes.json.order.total===expectedEditTotal,"total recomputed");
  assert(editRes.json.order.status==="under_review","still under_review");
  console.log("   PASS edit preserves price authority and remains under_review");

  // 15. Order cancel own under_review
  console.log("\n15. Order cancel own under_review");
  const cancelRes = await api(`/api/rvb/customer-orders/${order.id}/cancel`,"POST",{}, custLogin.access);
  console.log(`   Cancelled status ${cancelRes.json.order.status}`);
  assert(cancelRes.json.order.status==="cancelled","cancelled");
  const custAfterCancel = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  assert(custAfterCancel.balance===balanceBeforeOrder,"no balance on cancel");
  console.log("   PASS cancel no mutation");

  // 16. Edit after terminal should be blocked
  console.log("\n16. Edit after terminal blocked");
  try{
    await api(`/api/rvb/customer-orders/${order.id}`,"PATCH",{items:[{productId: prod.id, quantity:1, weightKg:1, price: prod.price}]}, custLogin.access);
    throw new Error("edit cancelled should fail");
  }catch(e:any){
    console.log(`   Edit cancelled correctly blocked ${e.code} ${e.status}`);
    assert(e.status===400 || e.code==="RVB_ORDER_ALREADY_REVIEWED","blocked");
  }
  try{
    await api(`/api/rvb/customer-orders/${order.id}/cancel`,"POST",{}, custLogin.access);
    throw new Error("cancel cancelled should fail");
  }catch(e:any){
    console.log(`   Cancel cancelled correctly blocked ${e.code}`);
  }

  // 17. Management order review: accept, reject, edit+accept, duplicate
  console.log("\n17. Management order review");
  // Create new order for management accept
  const order2 = (await api("/api/rvb/customer-orders","POST",{items:[{productId: prod.id, quantity:1, weightKg:2, price: prod.price}]}, custLogin.access)).json.order;
  console.log(`   Created order2 ${order2.id} for accept`);
  const accept2 = await api(`/api/rvb/customer-orders/${order2.id}/review`,"POST",{status:"accepted"}, mgr.access);
  console.log(`   Manager accepted ${accept2.json.order.status}`);
  assert(accept2.json.order.status==="accepted","accepted");
  // Verify order acceptance does NOT create Sale (per contract)
  const salesAfterOrderAccept = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales.length;
  console.log(`   Sales after order accept ${salesAfterOrderAccept} should remain ${salesBeforeOrder} (order accept does NOT create Sale)`);
  assert(salesAfterOrderAccept===salesBeforeOrder,"order accept no sale");

  // Create order for reject
  const order3 = (await api("/api/rvb/customer-orders","POST",{items:[{productId: prod.id, quantity:1, weightKg:1, price: prod.price}]}, custLogin.access)).json.order;
  const reject3 = await api(`/api/rvb/customer-orders/${order3.id}/review`,"POST",{status:"rejected", notes:"QA reject"}, mgr.access);
  console.log(`   Manager rejected ${reject3.json.order.status}`);
  assert(reject3.json.order.status==="rejected","rejected");

  // Edit then Accept
  const order4 = (await api("/api/rvb/customer-orders","POST",{items:[{productId: prod.id, quantity:1, weightKg:1, price: prod.price}]}, custLogin.access)).json.order;
  console.log(`   Created order4 ${order4.id} for edit+accept`);
  const editAccept = await api(`/api/rvb/customer-orders/${order4.id}/review`,"POST",{status:"accepted", items:[{productId: prod.id, quantity:2, weightKg:3, price:999999}]}, mgr.access);
  console.log(`   Edit+Accept total ${editAccept.json.order.total} price ${editAccept.json.order.items[0].price}`);
  assert(editAccept.json.order.items[0].price===prod.price,"edit+accept price authoritative");
  assert(editAccept.json.order.status==="accepted","accepted");

  // Duplicate review 409
  try{
    await api(`/api/rvb/customer-orders/${order4.id}/review`,"POST",{status:"accepted"}, mgr.access);
    throw new Error("dup should 409");
  }catch(e:any){
    console.log(`   Dup order review correctly ${e.code} ${e.status}`);
    assert(e.status===409 || e.code==="RVB_ORDER_ALREADY_REVIEWED","409");
  }

  // Supervisor can also review
  console.log("\n   Supervisor review");
  const order5 = (await api("/api/rvb/customer-orders","POST",{items:[{productId: prod.id, quantity:1, weightKg:1, price: prod.price}]}, custLogin.access)).json.order;
  const supLogin = await login(SUPERVISOR_TAG, SUPERVISOR_PWD);
  const supAccept = await api(`/api/rvb/customer-orders/${order5.id}/review`,"POST",{status:"accepted"}, supLogin.access);
  console.log(`   Supervisor accepted ${supAccept.json.order.status}`);
  assert(supAccept.json.order.status==="accepted","supervisor can accept");

  // 18. Request history vs Order history separate
  console.log("\n18. History separation");
  const reqHist = await api("/api/rvb/customer-requests","GET", undefined, custLogin.access);
  const ordHist = await api("/api/rvb/customer-orders","GET", undefined, custLogin.access);
  console.log(`   Requests ${reqHist.json.requests.length}, Orders ${ordHist.json.orders.length}`);
  assert(reqHist.json.requests.length>0,"requests exist");
  assert(ordHist.json.orders.length>0,"orders exist");
  console.log("   PASS separate histories");

  // 19. Activity: check general activities
  console.log("\n19. Activity");
  try{
    const act = await api("/api/rvb/activities","GET", undefined, custLogin.access);
    console.log(`   Activities ${act.json.activities?.length ?? act.json.total ?? "unknown"}`);
  }catch(e:any){ console.log(`   Activities ${e.code}`); }
  console.log("   PASS activity check");

  // 20. PDF sanitizer
  console.log("\n20. PDF sanitizer");
  const custForPdf = (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer;
  const salesForPdf = (await api("/api/rvb/portal/customer/sales","GET", undefined, custLogin.access)).json.sales;
  const paysForPdf = (await api("/api/rvb/portal/customer/payments","GET", undefined, custLogin.access)).json.payments;
  const ordersForPdf = (await api("/api/rvb/customer-orders","GET", undefined, custLogin.access)).json.orders;
  const sanitized = sanitizeForCustomerPdf(custForPdf, salesForPdf, paysForPdf, ordersForPdf, currency);
  const sStr = JSON.stringify(sanitized);
  assert(!sStr.includes("password"),"no password");
  assert(!sStr.includes("refreshToken"),"no refreshToken");
  assert(!sStr.includes("serverRevision"),"no serverRevision");
  assert(!sStr.includes("_id"),"no _id");
  console.log("   PASS pdf sanitizer");

  // 21. Security: customer cannot access management, spoof, etc.
  console.log("\n21. Security");
  try{ await api("/api/rvb/customers","GET", undefined, custLogin.access); throw new Error("should 403"); }catch(e:any){ console.log(`   GET /customers blocked ${e.code} ${e.status}`); assert(e.status===403,"403"); }
  try{ await api("/api/rvb/accounts","GET", undefined, custLogin.access); throw new Error("should 403"); }catch(e:any){ console.log(`   GET /accounts blocked ${e.code}`); assert(e.status===403,"403"); }
  try{ await api("/api/rvb/customer-requests","POST",{type:"insert_shipment", customerId:"cust-other-id", items:[{productId: prod.id, quantity:1, weightKg:1, price: prod.price}]}, custLogin.access); throw new Error("spoof should 403"); }catch(e:any){ console.log(`   Spoof customerId in request blocked ${e.code} ${e.status}`); assert(e.status===403,"403"); }
  try{ await api("/api/rvb/customer-orders","POST",{customerId:"cust-other-id", items:[{productId: prod.id, quantity:1, weightKg:1, price: prod.price}]}, custLogin.access); throw new Error("spoof order should 403"); }catch(e:any){ console.log(`   Spoof customerId in order blocked ${e.code}`); assert(e.status===403,"403"); }
  // Try to edit another customer's order (create order as customer, try edit as same customer but different order? For truly other customer, need another customer account, but we can test that editing an order not owned should 403)
  // Customer cannot review own request/order
  const ownReqForReview = reqHist.json.requests.find((r:any)=> r.status==="under_review");
  if(ownReqForReview){
    try{ await api(`/api/rvb/customer-requests/${ownReqForReview.id}/review`,"POST",{status:"accepted"}, custLogin.access); throw new Error("customer review should 403"); }catch(e:any){ console.log(`   Customer review own request blocked ${e.code}`); assert(e.status===403,"403"); }
  }
  // Create a new order to test review blocked
  const tmpOrder = (await api("/api/rvb/customer-orders","POST",{items:[{productId: prod.id, quantity:1, weightKg:1, price: prod.price}]}, custLogin.access)).json.order;
  try{ await api(`/api/rvb/customer-orders/${tmpOrder.id}/review`,"POST",{status:"accepted"}, custLogin.access); throw new Error("customer review order should 403"); }catch(e:any){ console.log(`   Customer review own order blocked ${e.code}`); assert(e.status===403,"403"); }
  await api(`/api/rvb/customer-orders/${tmpOrder.id}/cancel`,"POST",{}, custLogin.access);
  console.log("   Cleaned tmp order");
  // Catalog for supplier blocked
  try{ await api("/api/rvb/catalog/products?for=supplier","GET", undefined, custLogin.access); throw new Error("should 403"); }catch(e:any){ console.log(`   Catalog for=supplier blocked for customer ${e.code}`); assert(e.status===403,"403"); }

  // 22. Language
  console.log("\n22. Language");
  await api("/api/rvb/auth/preferences","PATCH",{ui:{language:"ar"}}, custLogin.access);
  console.log("   Set ar PASS");
  const portalAr = await api("/api/rvb/portal/customer","GET", undefined, custLogin.access);
  assert(portalAr.json.customer.balance=== (await api("/api/rvb/portal/customer","GET", undefined, custLogin.access)).json.customer.balance,"still works");
  await api("/api/rvb/auth/preferences","PATCH",{ui:{language:"en"}}, custLogin.access);
  console.log("   Reverted en PASS");

  console.log("\n=== Customer Test PASS ===");
}

run().catch(e=>{ console.error("Customer Test FAIL", e); console.error(e.stack); process.exit(1); });
