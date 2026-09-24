import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

async function run() {
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongod.waitUntilRunning();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  // Import after mongoose connected
  const { WorkerModel } = await import("./src/models/worker.model");
  const { SupplierModel } = await import("./src/models/supplier.model");
  const { CustomerModel } = await import("./src/models/customer.model");
  const { ProductModel } = await import("./src/models/product.model");
  const { WorkerRequestModel } = await import("./src/models/worker-request.model");
  const { SupplierRequestModel } = await import("./src/models/supplier-request.model");
  const { CustomerRequestModel } = await import("./src/models/customer-request.model");
  const { CustomerOrderModel } = await import("./src/models/customer-order.model");
  const { RvbAccountModel } = await import("./src/models/rvb-account.model");
  const { RvbSessionModel } = await import("./src/models/rvb-session.model");
  const { ConversationModel } = await import("./src/models/conversation.model");
  const { MessageModel } = await import("./src/models/message.model");
  const { SyncChangeModel } = await import("./src/models/sync-change.model");
  const { SyncCounterModel } = await import("./src/models/sync-counter.model");
  const { createWorkerRequest, reviewWorkerRequest } = await import("./src/services/worker-request.service");
  const { createSupplierRequest, reviewSupplierRequest } = await import("./src/services/supplier-request.service");
  const { createCustomerRequest, reviewCustomerRequest } = await import("./src/services/customer-request.service");
  const { createCustomerOrder, reviewCustomerOrder } = await import("./src/services/customer-order.service");
  const { createRvbAccount } = await import("./src/services/rvb-account.service");
  const { pinMessage, createGroup } = await import("./src/services/chat.service");
  const { normalizeTag } = await import("./src/constants/rvb-account");

  let passed = 0, failed = 0;
  const ok = (n: string) => { console.log(`✅ ${n}`); passed++; };
  const fail = (n: string, e: any) => { console.log(`❌ ${n}: ${e?.message || e} code=${e?.code} status=${e?.status}`); failed++; };
  const assert = (c: any, m: string) => { if (!c) throw new Error(m); };

  const clean = async () => {
    await Promise.all([
      WorkerModel.deleteMany({}), SupplierModel.deleteMany({}), CustomerModel.deleteMany({}), ProductModel.deleteMany({}),
      WorkerRequestModel.deleteMany({}), SupplierRequestModel.deleteMany({}), CustomerRequestModel.deleteMany({}), CustomerOrderModel.deleteMany({}),
      RvbAccountModel.deleteMany({}), RvbSessionModel.deleteMany({}), ConversationModel.deleteMany({}), MessageModel.deleteMany({}),
      SyncChangeModel.deleteMany({}), SyncCounterModel.deleteMany({}),
    ]);
  };

  const createWorker = async (id: string, balance: number) => {
    return WorkerModel.create({ id, name: `Worker-${id}`, phone: "+213000", address: "addr", employmentDate: Date.now(), position: "butcher", startingSalary: balance, monthlySalary: 0, status: "active", balance, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "synced", serverRevision: 1 } as any);
  };
  const createSupplier = async (id: string) => SupplierModel.create({ id, name: `Sup-${id}`, phone: "+213", balance: 0, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "synced", serverRevision: 1 } as any);
  const createCustomer = async (id: string) => CustomerModel.create({ id, name: `Cust-${id}`, phone: "+213", type: "Retail", balance: 0, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "synced", serverRevision: 1 } as any);
  const createProduct = async (id: string, qty: number, weight: number, price: number) => ProductModel.create({ id, name: `Prod-${id}`, price, quantity: qty, weightKg: weight, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "synced", serverRevision: 1 } as any);
  const createManager = async (tag: string) => createRvbAccount({ tag, displayName: `Mgr ${tag}`, role: "manager", password: "password123", confirmPassword: "password123" } as any);

  // A. REQUEST REVIEW CONCURRENCY
  console.log("\n=== A. REQUEST REVIEW CONCURRENCY ===");
  // Worker Payment double Accept
  try {
    await clean();
    const w = await createWorker("W1", 100);
    const mgr1 = await createManager("mgr1");
    const mgr2 = await createManager("mgr2");
    const req: any = await createWorkerRequest({ workerId: w.id, accountId: mgr1.id, type: "payment", amount: 30, description: "pay" });
    const p1 = reviewWorkerRequest(req.id, "accepted", mgr1.id, "ok");
    const p2 = reviewWorkerRequest(req.id, "accepted", mgr2.id, "ok");
    const results: any[] = await Promise.allSettled([p1, p2]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    const failCount = results.filter((r: any) => r.status === "rejected").length;
    assert(succ === 1 && failCount === 1, `expected 1 success 1 fail got ${succ} ${failCount}`);
    const rejected = results.find((r: any) => r.status === "rejected") as any;
    assert(rejected.reason.code === "RVB_REQUEST_ALREADY_REVIEWED" && rejected.reason.status === 409, `expected 409 RVB_REQUEST_ALREADY_REVIEWED got ${rejected.reason.code} ${rejected.reason.status}`);
    const freshReq: any = await WorkerRequestModel.findOne({ id: req.id }).lean();
    assert(freshReq.status === "accepted", "winner accepted");
    const payments = await mongoose.model("Payment").find({ entityId: w.id }).lean().catch(async () => await mongoose.connection.db.collection("payments").find({ entityId: w.id }).toArray().catch(()=>[])) as any;
    // Use PaymentModel if available
    const { PaymentModel } = await import("./src/models/payment.model");
    const payDocs = await PaymentModel.find({ entityId: w.id }).lean();
    assert(payDocs.length === 1, `exactly one Payment, got ${payDocs.length}`);
    const workerAfter: any = await WorkerModel.findOne({ id: w.id }).lean();
    assert(workerAfter.balance === 70, `balance 70 got ${workerAfter.balance}`);
    const syncChanges = await SyncChangeModel.find({ entity: "payment" }).lean();
    assert(syncChanges.length === 1, `one SyncChange for payment, got ${syncChanges.length}`);
    ok("A1 Worker Payment double Accept");
  } catch (e: any) { fail("A1 Worker Payment double Accept", e); }

  // Worker Loan double Accept
  try {
    await clean();
    const w = await createWorker("W2", 50);
    const mgr1 = await createManager("mgr3");
    const mgr2 = await createManager("mgr4");
    const req: any = await createWorkerRequest({ workerId: w.id, accountId: mgr1.id, type: "loan", amount: 80, description: "loan" });
    const p1 = reviewWorkerRequest(req.id, "accepted", mgr1.id, "ok");
    const p2 = reviewWorkerRequest(req.id, "accepted", mgr2.id, "ok");
    const results: any[] = await Promise.allSettled([p1, p2]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    assert(succ === 1, `loan 1 success got ${succ}`);
    const rejected: any = results.find((r: any) => r.status === "rejected");
    assert(rejected.reason.code === "RVB_REQUEST_ALREADY_REVIEWED" && rejected.reason.status === 409, "409");
    const workerAfter: any = await WorkerModel.findOne({ id: w.id }).lean();
    assert(workerAfter.balance === 130, `balance 130 got ${workerAfter.balance}`);
    ok("A2 Worker Loan double Accept");
  } catch (e: any) { fail("A2 Worker Loan double Accept", e); }

  // Supplier New Supply double Accept
  try {
    await clean();
    const s = await createSupplier("S1");
    const prod = await createProduct("P1", 100, 100, 10);
    const mgr1 = await createManager("mgr5");
    const mgr2 = await createManager("mgr6");
    const req: any = await createSupplierRequest({ supplierId: s.id, accountId: mgr1.id, type: "new_supply", items: [{ productId: prod.id, quantity: 5, weightKg: 5, price: 10, total: 50 }], total: 50, description: "supply" });
    const p1 = reviewSupplierRequest(req.id, "accepted", mgr1.id, "ok");
    const p2 = reviewSupplierRequest(req.id, "accepted", mgr2.id, "ok");
    const results: any[] = await Promise.allSettled([p1, p2]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    assert(succ === 1, `supplier 1 success got ${succ}`);
    const rejected: any = results.find((r: any) => r.status === "rejected");
    assert(rejected.reason.code === "RVB_REQUEST_ALREADY_REVIEWED" && rejected.reason.status === 409, "409");
    const { PurchaseModel } = await import("./src/models/purchase.model");
    const purs = await PurchaseModel.find({ supplierId: s.id }).lean();
    assert(purs.length === 1, `one Purchase got ${purs.length}`);
    const prodAfter: any = await ProductModel.findOne({ id: prod.id }).lean();
    assert(prodAfter.quantity === 105 && prodAfter.weightKg === 105, `stock 105 got ${prodAfter.quantity} ${prodAfter.weightKg}`);
    ok("A3 Supplier New Supply double Accept");
  } catch (e: any) { fail("A3 Supplier New Supply double Accept", e); }

  // Customer Insert Shipment double Accept
  try {
    await clean();
    const c = await createCustomer("C1");
    const prod = await createProduct("P2", 100, 100, 10);
    const mgr1 = await createManager("mgr7");
    const mgr2 = await createManager("mgr8");
    const req: any = await createCustomerRequest({ customerId: c.id, accountId: mgr1.id, type: "insert_shipment", items: [{ productId: prod.id, quantity: 5, weightKg: 5, price: 10, total: 50 }], total: 50, description: "ship" });
    const p1 = reviewCustomerRequest(req.id, "accepted", mgr1.id, "ok");
    const p2 = reviewCustomerRequest(req.id, "accepted", mgr2.id, "ok");
    const results: any[] = await Promise.allSettled([p1, p2]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    assert(succ === 1, `customer ship 1 success got ${succ}`);
    const rejected: any = results.find((r: any) => r.status === "rejected");
    assert(rejected.reason.code === "RVB_REQUEST_ALREADY_REVIEWED" && rejected.reason.status === 409, "409");
    const { SaleModel } = await import("./src/models/sale.model");
    const sales = await SaleModel.find({ customerId: c.id }).lean();
    assert(sales.length === 1, `one Sale got ${sales.length}`);
    const prodAfter: any = await ProductModel.findOne({ id: prod.id }).lean();
    assert(prodAfter.quantity === 95, `qty 95 got ${prodAfter.quantity}`);
    ok("A4 Customer Insert Shipment double Accept");
  } catch (e: any) { fail("A4 Customer Insert Shipment double Accept", e); }

  // Customer Order double Accept (if applicable, no business side effect but should be atomic)
  try {
    await clean();
    const c = await createCustomer("C2");
    const prod = await createProduct("P3", 100, 100, 10);
    const custAcc = await createRvbAccount({ tag: "cust2", displayName: "Cust2", role: "customer", linkedEntityType: "customer", linkedEntityId: c.id, password: "password123", confirmPassword: "password123" } as any);
    const mgr1 = await createManager("mgr9");
    const mgr2 = await createManager("mgr10");
    const order: any = await createCustomerOrder({ customerId: c.id, accountId: custAcc.id, items: [{ productId: prod.id, quantity: 2, weightKg: 2, price: 10, total: 20 }], total: 20, notes: "order" });
    const p1 = reviewCustomerOrder(order.id, "accepted", mgr1.id, undefined, "ok");
    const p2 = reviewCustomerOrder(order.id, "accepted", mgr2.id, undefined, "ok");
    const results: any[] = await Promise.allSettled([p1, p2]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    assert(succ === 1, `order 1 success got ${succ}`);
    const rejected: any = results.find((r: any) => r.status === "rejected");
    assert(rejected.reason.code === "RVB_ORDER_ALREADY_REVIEWED" && rejected.reason.status === 409, "409");
    ok("A5 Customer Order double Accept");
  } catch (e: any) { fail("A5 Customer Order double Accept", e); }

  // Accept vs Reject
  try {
    await clean();
    const w = await createWorker("W3", 100);
    const mgr1 = await createManager("mgr11");
    const mgr2 = await createManager("mgr12");
    const req: any = await createWorkerRequest({ workerId: w.id, accountId: mgr1.id, type: "payment", amount: 30, description: "pay" });
    const p1 = reviewWorkerRequest(req.id, "accepted", mgr1.id, "ok");
    const p2 = reviewWorkerRequest(req.id, "rejected", mgr2.id, "no");
    const results: any[] = await Promise.allSettled([p1, p2]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    assert(succ === 1, `accept vs reject 1 success got ${succ}`);
    const fresh: any = await WorkerRequestModel.findOne({ id: req.id }).lean();
    assert(["accepted", "rejected"].includes(fresh.status), `status terminal got ${fresh.status}`);
    // Ensure only one business side effect (if accepted won, payment exists; if rejected won, no payment)
    const { PaymentModel } = await import("./src/models/payment.model");
    const pays = await PaymentModel.find({ entityId: w.id }).lean();
    if (fresh.status === "accepted") assert(pays.length === 1, "accepted should have payment");
    else assert(pays.length === 0, "rejected should have no payment");
    ok("A6 Accept vs Reject");
  } catch (e: any) { fail("A6 Accept vs Reject", e); }

  // B. DUPLICATE ACCOUNT CONCURRENCY
  console.log("\n=== B. DUPLICATE ACCOUNT CONCURRENCY ===");
  try {
    await clean();
    const results: any[] = await Promise.allSettled([
      createRvbAccount({ tag: "qa.user", displayName: "A", role: "manager", password: "password123", confirmPassword: "password123" } as any),
      createRvbAccount({ tag: "qa.user", displayName: "B", role: "manager", password: "password123", confirmPassword: "password123" } as any),
    ]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    const failCount = results.filter((r: any) => r.status === "rejected").length;
    assert(succ === 1 && failCount === 1, `tag race 1 success 1 fail got ${succ} ${failCount}`);
    const rejected: any = results.find((r: any) => r.status === "rejected");
    const err = (rejected as any).reason;
    assert(err.code === "RVB_TAG_ALREADY_EXISTS" && err.status === 409, `expected 409 RVB_TAG_ALREADY_EXISTS got ${err.code} ${err.status}`);
    const count = await RvbAccountModel.countDocuments({ tag: normalizeTag("qa.user") });
    assert(count === 1, `tag count 1 got ${count}`);
    ok("B1 Duplicate tag race -> 409");
  } catch (e: any) { fail("B1 Duplicate tag race", e); }

  try {
    await clean();
    const w = await createWorker("W10", 0);
    const r1 = createRvbAccount({ tag: "user1", displayName: "U1", role: "worker", linkedEntityType: "worker", linkedEntityId: w.id, password: "password123", confirmPassword: "password123" } as any);
    const r2 = createRvbAccount({ tag: "user2", displayName: "U2", role: "worker", linkedEntityType: "worker", linkedEntityId: w.id, password: "password123", confirmPassword: "password123" } as any);
    const results: any[] = await Promise.allSettled([r1, r2]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    assert(succ === 1, `entity link 1 success got ${succ}`);
    const rejected: any = results.find((r: any) => r.status === "rejected");
    const err = (rejected as any).reason;
    assert(err.code === "RVB_ENTITY_ALREADY_LINKED" && err.status === 409, `expected 409 RVB_ENTITY_ALREADY_LINKED got ${err.code} ${err.status}`);
    const count = await RvbAccountModel.countDocuments({ linkedEntityType: "worker", linkedEntityId: w.id });
    assert(count === 1, `linked count 1 got ${count}`);
    ok("B2 Duplicate entity-link race -> 409");
  } catch (e: any) { fail("B2 Duplicate entity-link race", e); }

  try {
    await clean();
    await createWorker("W11", 0);
    const results: any[] = await Promise.allSettled([
      createRvbAccount({ tag: "QA.User", displayName: "A", role: "manager", password: "password123", confirmPassword: "password123" } as any),
      createRvbAccount({ tag: "@qa.user", displayName: "B", role: "manager", password: "password123", confirmPassword: "password123" } as any),
    ]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    assert(succ === 1, `normalized tag race 1 success got ${succ}`);
    const rejected: any = results.find((r: any) => r.status === "rejected");
    assert(rejected.reason.code === "RVB_TAG_ALREADY_EXISTS" && rejected.reason.status === 409, "409");
    ok("B3 Normalized tag race QA.User vs @qa.user -> 409");
  } catch (e: any) { fail("B3 Normalized tag race", e); }

  // Check raw Mongo error not exposed
  try {
    await clean();
    const results: any[] = await Promise.allSettled([
      createRvbAccount({ tag: "rawtest", displayName: "A", role: "manager", password: "password123", confirmPassword: "password123" } as any),
      createRvbAccount({ tag: "rawtest", displayName: "B", role: "manager", password: "password123", confirmPassword: "password123" } as any),
    ]);
    const rejected: any = results.find((r: any) => r.status === "rejected");
    const msg = String(rejected.reason.message || "");
    assert(!msg.includes("E11000") && !msg.includes("duplicate key") && !msg.includes("index:"), `raw Mongo not exposed, got ${msg}`);
    ok("B4 Raw Mongo E11000 not exposed");
  } catch (e: any) { fail("B4 Raw Mongo not exposed", e); }

  // C. CHAT PINS
  console.log("\n=== C. CHAT PINS ===");
  try {
    await clean();
    const mgr = await createManager("pinmgr");
    const u1 = await createRvbAccount({ tag: "userpin1", displayName: "U1", role: "worker", linkedEntityType: "worker", linkedEntityId: (await createWorker("WP1", 0)).id, password: "password123", confirmPassword: "password123" } as any);
    const u2 = await createRvbAccount({ tag: "userpin2", displayName: "U2", role: "worker", linkedEntityType: "worker", linkedEntityId: (await createWorker("WP2", 0)).id, password: "password123", confirmPassword: "password123" } as any);
    const u3 = await createRvbAccount({ tag: "userpin3", displayName: "U3", role: "worker", linkedEntityType: "worker", linkedEntityId: (await createWorker("WP3", 0)).id, password: "password123", confirmPassword: "password123" } as any);
    const conv: any = await createGroup(mgr.id, { name: "PinTest", memberIds: [u1.id, u2.id, u3.id] });
    // Create 4 messages
    const { sendMessage } = await import("./src/services/chat.service");
    const m1 = await sendMessage(conv.id, mgr.id, "msg1");
    const m2 = await sendMessage(conv.id, mgr.id, "msg2");
    const m3 = await sendMessage(conv.id, mgr.id, "msg3");
    const m4 = await sendMessage(conv.id, mgr.id, "msg4");
    await pinMessage(conv.id, m1.id, mgr.id);
    await pinMessage(conv.id, m2.id, mgr.id);
    let after2: any = await ConversationModel.findOne({ id: conv.id }).lean();
    assert(after2.pinnedMessages.length === 2, `2 pins got ${after2.pinnedMessages.length}`);
    const p1 = pinMessage(conv.id, m3.id, mgr.id);
    const p2 = pinMessage(conv.id, m4.id, mgr.id);
    const results: any[] = await Promise.allSettled([p1, p2]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    const failCount = results.filter((r: any) => r.status === "rejected").length;
    assert(succ === 1 && failCount === 1, `pin race 1 success 1 fail got ${succ} ${failCount}`);
    const rejected: any = results.find((r: any) => r.status === "rejected");
    assert(rejected.reason.code === "RVB_PIN_LIMIT" && rejected.reason.status === 409, `expected 409 RVB_PIN_LIMIT got ${rejected.reason.code} ${rejected.reason.status}`);
    const finalConv: any = await ConversationModel.findOne({ id: conv.id }).lean();
    assert(finalConv.pinnedMessages.length === 3, `final 3 got ${finalConv.pinnedMessages.length}`);
    ok("C1 Chat max 3 pins under concurrency -> 3");
  } catch (e: any) { fail("C1 Chat pins", e); }

  try {
    await clean();
    const mgr = await createManager("pinmgr2");
    const u1 = await createRvbAccount({ tag: "userpina", displayName: "U1", role: "worker", linkedEntityType: "worker", linkedEntityId: (await createWorker("WPA", 0)).id, password: "password123", confirmPassword: "password123" } as any);
    const conv: any = await createGroup(mgr.id, { name: "PinDup", memberIds: [u1.id] });
    const { sendMessage } = await import("./src/services/chat.service");
    const m1 = await sendMessage(conv.id, mgr.id, "dup");
    const p1 = pinMessage(conv.id, m1.id, mgr.id);
    const p2 = pinMessage(conv.id, m1.id, mgr.id);
    const results: any[] = await Promise.allSettled([p1, p2]);
    const succ = results.filter((r: any) => r.status === "fulfilled").length;
    // One should succeed, one should fail with ALREADY_PINNED (409) — but our implementation uses $ne check, so second will fail with ALREADY_PINNED
    const failReasons: any[] = results.filter((r: any) => r.status === "rejected").map((r: any) => r.reason);
    const hasAlreadyPinned = failReasons.some((e: any) => e.code === "RVB_ALREADY_PINNED");
    const hasLimit = failReasons.some((e: any) => e.code === "RVB_PIN_LIMIT");
    // For same message, we expect ALREADY_PINNED, but if both race, one succeeds, one fails with ALREADY_PINNED (or PIN_LIMIT if count already 1? but count 1 <3 so ALREADY_PINNED)
    assert(succ === 1, `dup pin 1 success got ${succ}`);
    assert(hasAlreadyPinned || hasLimit, `expected ALREADY_PINNED or PIN_LIMIT got ${failReasons.map((e:any)=>e.code).join(",")}`);
    const finalConv: any = await ConversationModel.findOne({ id: conv.id }).lean();
    assert(finalConv.pinnedMessages.length === 1, `final 1 got ${finalConv.pinnedMessages.length}`);
    ok("C2 Same message pinned concurrently -> 1 pin");
  } catch (e: any) { fail("C2 Same message pin", e); }

  try {
    await clean();
    const mgr = await createManager("pinmgr3");
    const u1 = await createRvbAccount({ tag: "userpinb", displayName: "U1", role: "worker", linkedEntityType: "worker", linkedEntityId: (await createWorker("WPB", 0)).id, password: "password123", confirmPassword: "password123" } as any);
    const conv: any = await createGroup(mgr.id, { name: "PinUnpin", memberIds: [u1.id] });
    const { sendMessage } = await import("./src/services/chat.service");
    const m1 = await sendMessage(conv.id, mgr.id, "a");
    const m2 = await sendMessage(conv.id, mgr.id, "b");
    const m3 = await sendMessage(conv.id, mgr.id, "c");
    await pinMessage(conv.id, m1.id, mgr.id);
    await pinMessage(conv.id, m2.id, mgr.id);
    await pinMessage(conv.id, m3.id, mgr.id);
    let conv3: any = await ConversationModel.findOne({ id: conv.id }).lean();
    assert(conv3.pinnedMessages.length === 3, "3 pins");
    const { unpinMessage } = await import("./src/services/chat.service");
    await unpinMessage(conv.id, m1.id, mgr.id);
    let afterUnpin: any = await ConversationModel.findOne({ id: conv.id }).lean();
    assert(afterUnpin.pinnedMessages.length === 2, "2 after unpin");
    const m4 = await sendMessage(conv.id, mgr.id, "d");
    await pinMessage(conv.id, m4.id, mgr.id);
    let finalConv: any = await ConversationModel.findOne({ id: conv.id }).lean();
    assert(finalConv.pinnedMessages.length === 3, `after unpin+pin 3 got ${finalConv.pinnedMessages.length}`);
    ok("C3 Unpin then pin succeeds");
  } catch (e: any) { fail("C3 Unpin then pin", e); }

  // D. PRICE AUTHORITY
  console.log("\n=== D. PRICE AUTHORITY ===");
  try {
    await clean();
    const c = await createCustomer("CPrice");
    const prod = await createProduct("PPrice", 100, 100, 1200);
    const custAcc = await createRvbAccount({ tag: "custprice", displayName: "Cust", role: "customer", linkedEntityType: "customer", linkedEntityId: c.id, password: "password123", confirmPassword: "password123" } as any);
    // Forged price 1
    const order: any = await createCustomerOrder({ customerId: c.id, accountId: custAcc.id, items: [{ productId: prod.id, quantity: 2, weightKg: 2, price: 1, total: 2 }], total: 2, notes: "forged" });
    assert(order.items[0].price === 1200, `price should be 1200 got ${order.items[0].price}`);
    assert(order.total === 2400, `total 2400 got ${order.total}`);
    // Forged high price
    const order2: any = await createCustomerOrder({ customerId: c.id, accountId: custAcc.id, items: [{ productId: prod.id, quantity: 1, weightKg: 1, price: 999999, total: 999999 }], total: 999999, notes: "forged2" });
    assert(order2.items[0].price === 1200, `high forged price should be 1200 got ${order2.items[0].price}`);
    assert(order2.total === 1200, `total 1200 got ${order2.total}`);
    ok("D1 Forged Customer Order price blocked (server authoritative)");
  } catch (e: any) { fail("D1 Forged price", e); }

  try {
    await clean();
    const c = await createCustomer("CPrice2");
    const prod = await createProduct("PPrice2", 100, 100, 1200);
    const custAcc = await createRvbAccount({ tag: "custprice2", displayName: "Cust", role: "customer", linkedEntityType: "customer", linkedEntityId: c.id, password: "password123", confirmPassword: "password123" } as any);
    const mgr = await createManager("mgrprice");
    const order: any = await createCustomerOrder({ customerId: c.id, accountId: custAcc.id, items: [{ productId: prod.id, quantity: 2, weightKg: 2, price: 1200, total: 2400 }], total: 2400, notes: "ok" });
    // Change product price before review
    await ProductModel.updateOne({ id: prod.id }, { $set: { price: 1400 } });
    // Manager edits then accepts with forged low price — should be re-authorized to 1400? Actually edit then accept with editedItems containing forged price
    // For this test, we check that at review time, edited price is also authoritative (1400)
    const edited = [{ productId: prod.id, quantity: 2, weightKg: 2, price: 1, total: 2 }];
    const reviewed: any = await reviewCustomerOrder(order.id, "accepted", mgr.id, edited, "ok");
    // According to our fix, edited price should be overwritten to auth price 1400
    assert(reviewed.items[0].price === 1400, `price after edit should be 1400 got ${reviewed.items[0].price}`);
    assert(reviewed.total === 2800, `total 2800 got ${reviewed.total}`);
    ok("D2 Price change before review — edited price authoritative (1400)");
  } catch (e: any) { fail("D2 Price change", e); }

  // Also test that non-edited review does not change price (uses stored auth price at creation)
  try {
    await clean();
    const c = await createCustomer("CPrice3");
    const prod = await createProduct("PPrice3", 100, 100, 1200);
    const custAcc = await createRvbAccount({ tag: "custprice3", displayName: "Cust", role: "customer", linkedEntityType: "customer", linkedEntityId: c.id, password: "password123", confirmPassword: "password123" } as any);
    const mgr = await createManager("mgrprice3");
    const order: any = await createCustomerOrder({ customerId: c.id, accountId: custAcc.id, items: [{ productId: prod.id, quantity: 1, weightKg: 1, price: 1200, total: 1200 }], total: 1200, notes: "ok" });
    await ProductModel.updateOne({ id: prod.id }, { $set: { price: 1400 } });
    // Review without editedItems — should keep original stored price 1200 (since no edit, not re-enforce?) Our implementation keeps stored price for non-edited review (existingNormalized from stored order)
    const reviewed: any = await reviewCustomerOrder(order.id, "accepted", mgr.id, undefined, "ok");
    // The stored order's items price was 1200 at creation, review without edit keeps 1200 (not 1400) — this is current behavior
    // We check that it does not become 1400 and does not become forged 1
    assert(reviewed.items[0].price === 1200, `non-edited review should keep 1200 got ${reviewed.items[0].price}`);
    ok("D3 Non-edited review keeps original auth price (1200)");
  } catch (e: any) { fail("D3 Non-edited", e); }

  // E. DISCREPANCY VALIDATION
  console.log("\n=== E. DISCREPANCY VALIDATION ===");
  try {
    await clean();
    const w = await createWorker("WDis", 0);
    const mgr = await createManager("mgrdis");
    const okDesc = "a".repeat(2000);
    const badDesc = "a".repeat(2001);
    const reqOk: any = await createWorkerRequest({ workerId: w.id, accountId: mgr.id, type: "discrepancy", description: okDesc });
    assert(reqOk.description.length === 2000, "2000 accepted");
    let threw = false;
    try { await createWorkerRequest({ workerId: w.id, accountId: mgr.id, type: "discrepancy", description: badDesc }); } catch (err: any) { threw = true; assert(err.code === "RVB_DESCRIPTION_TOO_LONG" && err.status === 400, `expected 400 RVB_DESCRIPTION_TOO_LONG got ${err.code} ${err.status}`); }
    assert(threw, "2001 should reject");
    ok("E1 Worker discrepancy 2000/2001");
  } catch (e: any) { fail("E1 Worker discrepancy", e); }

  try {
    await clean();
    const s = await createSupplier("SDis");
    const okDesc = "a".repeat(2000);
    const badDesc = "a".repeat(2001);
    const reqOk: any = await createSupplierRequest({ supplierId: s.id, accountId: (await createManager("mgrsdis")).id, type: "discrepancy", description: okDesc });
    assert(reqOk.description.length === 2000, "2000");
    let threw = false;
    try { await createSupplierRequest({ supplierId: s.id, accountId: (await createManager("mgrsdis2")).id, type: "discrepancy", description: badDesc }); } catch (err: any) { threw = true; assert(err.code === "RVB_DESCRIPTION_TOO_LONG" && err.status === 400, "409"); }
    assert(threw, "2001 reject");
    ok("E2 Supplier discrepancy 2000/2001");
  } catch (e: any) { fail("E2 Supplier discrepancy", e); }

  try {
    await clean();
    const c = await createCustomer("CDis");
    const okDesc = "a".repeat(2000);
    const badDesc = "a".repeat(2001);
    const reqOk: any = await createCustomerRequest({ customerId: c.id, accountId: (await createManager("mgrcdis")).id, type: "discrepancy", description: okDesc });
    assert(reqOk.description.length === 2000, "2000");
    let threw = false;
    try { await createCustomerRequest({ customerId: c.id, accountId: (await createManager("mgrcdis2")).id, type: "discrepancy", description: badDesc }); } catch (err: any) { threw = true; assert(err.code === "RVB_DESCRIPTION_TOO_LONG" && err.status === 400, "400"); }
    assert(threw, "2001 reject");
    ok("E3 Customer discrepancy 2000/2001");
  } catch (e: any) { fail("E3 Customer discrepancy", e); }

  // F. ROLLBACK
  console.log("\n=== F. ROLLBACK ===");
  try {
    await clean();
    const s = await createSupplier("SRoll");
    const prod = await createProduct("PRoll", 10, 10, 10);
    const mgr = await createManager("mgrroll");
    // Create supplier request with valid item
    const req: any = await createSupplierRequest({ supplierId: s.id, accountId: mgr.id, type: "new_supply", items: [{ productId: prod.id, quantity: 2, weightKg: 2, price: 10, total: 20 }], total: 20, description: "roll" });
    // Inject failure: delete product before accept to cause product not found
    await ProductModel.deleteOne({ id: prod.id });
    let threw = false;
    try { await reviewSupplierRequest(req.id, "accepted", mgr.id, "ok"); } catch (err: any) { threw = true; }
    assert(threw, "should throw product not found");
    const freshReq: any = await SupplierRequestModel.findOne({ id: req.id }).lean();
    assert(freshReq.status === "under_review", `request should remain under_review after rollback, got ${freshReq.status}`);
    const purchases = await (await import("./src/models/purchase.model")).PurchaseModel.find({ supplierId: s.id }).lean();
    assert(purchases.length === 0, `no Purchase after rollback, got ${purchases.length}`);
    const syncChanges = await SyncChangeModel.find({ entity: "purchase" }).lean();
    assert(syncChanges.length === 0, `no SyncChange after rollback, got ${syncChanges.length}`);
    // Notification should not be duplicated? The failed review should not create notification
    // Check that no notification was created for accepted (only submitted exists)
    const { NotificationModel } = await import("./src/models/notification.model");
    const notifs = await NotificationModel.find({ "sourceEventId": `supplier-request:${req.id}:accepted` }).lean().catch(()=>[]);
    // Our service only creates notification after transaction success, so after rollback it should not have created accepted notification
    // Submitted notification exists, accepted should not
    assert(notifs.length === 0, `no accepted notification after rollback, got ${notifs.length}`);
    ok("F1 Rollback on downstream failure (supplier new_supply -> product not found)");
  } catch (e: any) { fail("F1 Rollback", e); }

  // Check duplicate SyncChange and notification not duplicated on concurrent accept
  console.log("\n=== G. DUPLICATE SYNC/NOTIFICATION ===");
  try {
    await clean();
    const w = await createWorker("WDup", 100);
    const mgr1 = await createManager("mgrdup1");
    const mgr2 = await createManager("mgrdup2");
    const req: any = await createWorkerRequest({ workerId: w.id, accountId: mgr1.id, type: "payment", amount: 30, description: "pay" });
    const beforeSync = await SyncChangeModel.countDocuments({ entity: "payment" });
    const beforeNotif = await (await import("./src/models/notification.model")).NotificationModel.countDocuments({ sourceEventId: `worker-request:${req.id}:accepted` }).catch(()=>0);
    const p1 = reviewWorkerRequest(req.id, "accepted", mgr1.id, "ok");
    const p2 = reviewWorkerRequest(req.id, "accepted", mgr2.id, "ok");
    await Promise.allSettled([p1, p2]);
    const afterSync = await SyncChangeModel.countDocuments({ entity: "payment" });
    assert(afterSync - beforeSync === 1, `exactly one SyncChange, got ${afterSync - beforeSync}`);
    const notifs = await (await import("./src/models/notification.model")).NotificationModel.find({ sourceEventId: `worker-request:${req.id}:accepted` }).lean().catch(()=>[]);
    // Notification should be exactly 1 (winner) or 0 if idempotency, but not 2
    assert(notifs.length <= 1, `at most one accepted notification, got ${notifs.length}`);
    ok("G1 Duplicate SyncChange/notification not duplicated");
  } catch (e: any) { fail("G1 Duplicate check", e); }

  await mongoose.disconnect();
  await mongod.stop();
  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
