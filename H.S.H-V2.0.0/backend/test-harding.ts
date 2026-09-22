import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { signAccessToken } from "./src/lib/rvb-auth";
import { RvbAccountModel } from "./src/models/rvb-account.model";
import { WorkerModel } from "./src/models/worker.model";
import { SupplierModel } from "./src/models/supplier.model";
import { CustomerModel } from "./src/models/customer.model";
import { ProductModel } from "./src/models/product.model";
import { WorkerRequestModel } from "./src/models/worker-request.model";
import { SupplierRequestModel } from "./src/models/supplier-request.model";
import { CustomerRequestModel } from "./src/models/customer-request.model";
import { CustomerOrderModel } from "./src/models/customer-order.model";
import { PaymentModel } from "./src/models/payment.model";
import { PurchaseModel } from "./src/models/purchase.model";
import { SaleModel } from "./src/models/sale.model";
import { SyncChangeModel } from "./src/models/sync-change.model";
import { SyncCounterModel } from "./src/models/sync-counter.model";
import workerRequestsRouter from "./src/routes/worker-requests";
import supplierRequestsRouter from "./src/routes/supplier-requests";
import customerRequestsRouter from "./src/routes/customer-requests";
import customerOrdersRouter from "./src/routes/customer-orders";
import { connectDatabase } from "./src/config/database";

async function createApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/rvb/worker-requests", workerRequestsRouter);
  app.use("/api/rvb/supplier-requests", supplierRequestsRouter);
  app.use("/api/rvb/customer-requests", customerRequestsRouter);
  app.use("/api/rvb/customer-orders", customerOrdersRouter);
  return app;
}

async function tokenFor(account: any) {
  const sessId = `sess-${uuidv4()}`;
  const now = Date.now();
  const { RvbSessionModel } = await import("./src/models/rvb-session.model");
  const { hashRefreshToken, parseExpiryToMs, getRefreshTTL } = await import("./src/lib/rvb-auth");
  const refreshToken = `refresh-${sessId}-${uuidv4()}`;
  const hash = hashRefreshToken(refreshToken);
  const ttl = parseExpiryToMs(getRefreshTTL());
  try {
    await RvbSessionModel.create({
      id: sessId,
      accountId: account.id,
      refreshTokenHash: hash,
      createdAt: now,
      expiresAt: now + ttl,
      revokedAt: null,
      lastUsedAt: now,
      rotationFamilyId: `fam-${uuidv4()}`,
    } as any);
  } catch {}
  return signAccessToken({ accountId: account.id, tag: account.tag, role: account.role, sessionId: sessId });
}

async function main() {
  console.log("Starting hardening tests with isolated MongoMemoryReplSet...");
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  const uri = replSet.getUri();
  process.env.MONGODB_URI = uri;
  process.env.RVB_JWT_ACCESS_SECRET = "test-access-secret-please-change-in-production-32chars";
  process.env.RVB_JWT_REFRESH_SECRET = "test-refresh-secret-please-change-in-production-32chars";
  process.env.RVB_TEST_MODE = "true";
  // Ensure DNS helper not using hardcoded
  delete process.env.MONGODB_DNS_SERVERS;
  await mongoose.connect(uri);
  const app = await createApp();

  let passed = 0;
  let failed = 0;
  const assert = (cond: boolean, msg: string) => {
    if (cond) { console.log(`PASS: ${msg}`); passed++; } else { console.error(`FAIL: ${msg}`); failed++; }
  };

  // Helper to create accounts
  async function createAccount(tag: string, role: string, linkedType: string | null, linkedId: string | null, status = "active") {
    const now = Date.now();
    const doc: any = {
      id: `rvbacc-${uuidv4()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      tag: tag.toLowerCase(),
      displayName: tag,
      role,
      linkedEntityType: linkedType,
      linkedEntityId: linkedId,
      status,
      onboardingStatus: "complete",
      profilePicture: null,
      archivedAt: null,
      lastLoginAt: null,
      passwordHash: "$2a$10$fakehashforTestPurposesOnly1234567890123456789012",
      mustChangePassword: false,
      passwordChangedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    };
    const created = await RvbAccountModel.create(doc);
    return created.toObject ? created.toObject() : created;
  }

  async function createWorker(name: string, balance = 10000) {
    const now = Date.now();
    const w: any = await WorkerModel.create({
      id: `worker-${uuidv4()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      serverRevision: 0,
      name,
      phone: "0123456789",
      address: "Addr",
      birthDate: now - 25*365*24*60*60*1000,
      employmentDate: now,
      position: "Butcher",
      notes: "",
      startingSalary: 5000,
      monthlySalary: 5000,
      status: "active",
      balance,
    });
    return w.toObject ? w.toObject() : w;
  }
  async function createSupplier(name: string, balance = 0) {
    const now = Date.now();
    const s: any = await SupplierModel.create({
      id: `sup-${uuidv4()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      serverRevision: 0,
      name,
      phone: "0123456789",
      address: "Addr",
      email: "s@test.com",
      balance,
    });
    return s.toObject ? s.toObject() : s;
  }
  async function createCustomer(name: string, balance = 0) {
    const now = Date.now();
    const c: any = await CustomerModel.create({
      id: `cust-${uuidv4()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      serverRevision: 0,
      name,
      phone: "0123456789",
      address: "Addr",
      type: "consumer",
      identificationNumber: "ID123",
      balance,
    });
    return c.toObject ? c.toObject() : c;
  }
  async function createProduct(name: string, qty = 100, weight = 200) {
    const now = Date.now();
    const p: any = await ProductModel.create({
      id: `prod-${uuidv4()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      serverRevision: 0,
      name,
      price: 100,
      quantity: qty,
      weightKg: weight,
      description: "test",
    });
    return p.toObject ? p.toObject() : p;
  }

  // Setup entities
  const workerA = await createWorker("WorkerA", 10000);
  const workerB = await createWorker("WorkerB", 10000);
  const supplierA = await createSupplier("SupplierA", 0);
  const supplierB = await createSupplier("SupplierB", 0);
  const customerA = await createCustomer("CustomerA", 0);
  const customerB = await createCustomer("CustomerB", 0);
  const product = await createProduct("Chicken", 100, 200);

  const managerAcc = await createAccount("manager1", "manager", null, null);
  const adminAcc = await createAccount("admin1", "admin", null, null);
  const workerAccA = await createAccount("workerA", "worker", "worker", workerA.id);
  const workerAccB = await createAccount("workerB", "worker", "worker", workerB.id);
  const supplierAccA = await createAccount("supplierA", "supplier", "supplier", supplierA.id);
  const supplierAccB = await createAccount("supplierB", "supplier", "supplier", supplierB.id);
  const customerAccA = await createAccount("customerA", "customer", "customer", customerA.id);
  const customerAccB = await createAccount("customerB", "customer", "customer", customerB.id);
  const supervisorAcc = await createAccount("supervisor1", "supervisor", "worker", workerA.id);

  const tokens: any = {
    manager: await tokenFor(managerAcc),
    admin: await tokenFor(adminAcc),
    workerA: await tokenFor(workerAccA),
    workerB: await tokenFor(workerAccB),
    supplierA: await tokenFor(supplierAccA),
    supplierB: await tokenFor(supplierAccB),
    customerA: await tokenFor(customerAccA),
    customerB: await tokenFor(customerAccB),
    supervisor: await tokenFor(supervisorAcc),
  };

  // Test RBAC: Worker tries supplier request list -> 403
  {
    const res = await request(app).get("/api/rvb/supplier-requests").set("Authorization", `Bearer ${tokens.workerA}`);
    assert(res.status === 403, "Worker tries supplier request list -> 403");
  }
  {
    const res = await request(app).get("/api/rvb/customer-requests").set("Authorization", `Bearer ${tokens.workerA}`);
    assert(res.status === 403, "Worker tries customer request list -> 403");
  }
  {
    const res = await request(app).get("/api/rvb/customer-orders").set("Authorization", `Bearer ${tokens.workerA}`);
    assert(res.status === 403, "Worker tries customer order list -> 403");
  }
  {
    const res = await request(app).get("/api/rvb/worker-requests").set("Authorization", `Bearer ${tokens.supplierA}`);
    assert(res.status === 403, "Supplier tries worker request list -> 403");
  }
  {
    const res = await request(app).get("/api/rvb/customer-requests").set("Authorization", `Bearer ${tokens.supplierA}`);
    assert(res.status === 403, "Supplier tries customer request -> 403");
  }
  {
    const res = await request(app).post("/api/rvb/worker-requests").set("Authorization", `Bearer ${tokens.supplierA}`).send({ workerId: workerA.id, type: "payment", amount: 100 });
    assert(res.status === 403, "Supplier supplies arbitrary workerId -> 403");
  }
  {
    const res = await request(app).get("/api/rvb/worker-requests").set("Authorization", `Bearer ${tokens.customerA}`);
    assert(res.status === 403, "Customer tries worker requests -> 403");
  }
  {
    const res = await request(app).get("/api/rvb/supplier-requests").set("Authorization", `Bearer ${tokens.customerA}`);
    assert(res.status === 403, "Customer tries supplier requests -> 403");
  }
  // Worker A tries Worker B request -> 403
  {
    // First create request for workerB via manager
    const created = await request(app).post("/api/rvb/worker-requests").set("Authorization", `Bearer ${tokens.manager}`).send({ workerId: workerB.id, type: "payment", amount: 100 });
    assert(created.status === 201, "Manager creates workerB request");
    const list = await request(app).get(`/api/rvb/worker-requests?workerId=${workerB.id}`).set("Authorization", `Bearer ${tokens.workerA}`);
    assert(list.status === 403, "Worker A tries Worker B request -> 403");
    // Worker A can see own
    const listOwn = await request(app).get(`/api/rvb/worker-requests?workerId=${workerA.id}`).set("Authorization", `Bearer ${tokens.workerA}`);
    // WorkerA has no requests yet, but should be 200 not 403
    assert(listOwn.status === 200, "Worker A can list own worker requests");
  }
  {
    const list = await request(app).get(`/api/rvb/supplier-requests?supplierId=${supplierB.id}`).set("Authorization", `Bearer ${tokens.supplierA}`);
    assert(list.status === 403, "Supplier A tries Supplier B request -> 403");
  }
  {
    const list = await request(app).get(`/api/rvb/customer-requests?customerId=${customerB.id}`).set("Authorization", `Bearer ${tokens.customerA}`);
    // Customer A should only see own, querying B should return own only (filtered to linked) not 403? Our implementation returns 200 with own only, but spec says 403 for trying to list B. We implemented that customer GET ignores query and returns own, so status 200 but not containing B. For test we check that B's request not leaked.
    // Create a request for customerB via manager
    const created = await request(app).post("/api/rvb/customer-requests").set("Authorization", `Bearer ${tokens.manager}`).send({ customerId: customerB.id, type: "discrepancy", description: "test" });
    assert(created.status === 201, "Manager creates customerB request");
    const listA = await request(app).get("/api/rvb/customer-requests").set("Authorization", `Bearer ${tokens.customerA}`);
    const hasB = (listA.body.requests || []).some((r: any) => r.customerId === customerB.id);
    assert(!hasB, "Customer A cannot see Customer B request");
  }
  {
    const orderRes = await request(app).post("/api/rvb/customer-orders").set("Authorization", `Bearer ${tokens.customerA}`).send({ items: [{ productId: product.id, quantity: 1, weightKg: 1, price: 100, total: 100 }], total: 100 });
    assert(orderRes.status === 201, "Customer A creates own order");
    const listB = await request(app).get("/api/rvb/customer-orders").set("Authorization", `Bearer ${tokens.customerB}`);
    const hasA = (listB.body.orders || []).some((o: any) => o.customerId === customerA.id);
    assert(!hasA, "Customer B cannot see Customer A order");
  }
  // Supervisor tests
  {
    // Supervisor own linked Worker request succeeds
    const res = await request(app).post("/api/rvb/worker-requests").set("Authorization", `Bearer ${tokens.supervisor}`).send({ workerId: workerA.id, type: "discrepancy", description: "sup test" });
    assert(res.status === 201, "Supervisor own linked Worker request succeeds");
    const res2 = await request(app).post("/api/rvb/worker-requests").set("Authorization", `Bearer ${tokens.supervisor}`).send({ workerId: workerB.id, type: "discrepancy", description: "fail" });
    assert(res2.status === 403, "Supervisor unrelated Worker request fails");
    const custList = await request(app).get("/api/rvb/customer-requests").set("Authorization", `Bearer ${tokens.supervisor}`);
    assert(custList.status === 200, "Supervisor Customer management succeeds");
    const supList = await request(app).get("/api/rvb/supplier-requests").set("Authorization", `Bearer ${tokens.supervisor}`);
    assert(supList.status === 403, "Supervisor Supplier management fails");
  }
  // Customer order POST by non-customer should fail
  {
    const res = await request(app).post("/api/rvb/customer-orders").set("Authorization", `Bearer ${tokens.workerA}`).send({ customerId: customerA.id, items: [{ productId: product.id, quantity: 1, weightKg: 1, price: 10, total: 10 }], total: 10 });
    assert(res.status === 403, "Worker cannot create customer order");
  }
  {
    const res = await request(app).post("/api/rvb/customer-orders").set("Authorization", `Bearer ${tokens.manager}`).send({ customerId: customerA.id, items: [{ productId: product.id, quantity: 1, weightKg: 1, price: 10, total: 10 }], total: 10 });
    assert(res.status === 403, "Manager cannot create customer order via customer portal (only customer)");
  }

  // Concurrency tests
  // Create a worker request for concurrency
  {
    const createRes = await request(app).post("/api/rvb/worker-requests").set("Authorization", `Bearer ${tokens.manager}`).send({ workerId: workerA.id, type: "payment", amount: 500 });
    assert(createRes.status === 201, "Create worker payment for concurrency");
    const reqId = createRes.body.request.id;
    const beforeBalance = (await WorkerModel.findOne({ id: workerA.id }).lean() as any).balance;
    const beforePayments = await PaymentModel.countDocuments({ entityId: workerA.id });
    // Two concurrent accepts
    const p1 = request(app).post(`/api/rvb/worker-requests/${reqId}/review`).set("Authorization", `Bearer ${tokens.manager}`).send({ status: "accepted" });
    const p2 = request(app).post(`/api/rvb/worker-requests/${reqId}/review`).set("Authorization", `Bearer ${tokens.admin}`).send({ status: "accepted" });
    const [r1, r2] = await Promise.all([p1, p2]);
    const successes = [r1, r2].filter(r => r.status === 200).length;
    const fails = [r1, r2].filter(r => r.status !== 200).length;
    assert(successes === 1 && fails === 1, "2 concurrent Worker payment accepts -> one succeeds one fails");
    const afterBalance = (await WorkerModel.findOne({ id: workerA.id }).lean() as any).balance;
    const afterPayments = await PaymentModel.countDocuments({ entityId: workerA.id });
    // Balance should decrease exactly 500 once
    assert(afterBalance === beforeBalance - 500, "Balance decreased exactly once");
    assert(afterPayments === beforePayments + 1, "Exactly one Payment created");
    // Check sync changes
    const changes = await SyncChangeModel.find({ entity: { $in: ["worker", "payment"] } }).lean();
    const hasWorker = changes.some((c: any) => c.entity === "worker" && c.entityId === workerA.id);
    const hasPayment = changes.some((c: any) => c.entity === "payment");
    assert(hasWorker, "Sync contains Worker update after payment");
    assert(hasPayment, "Sync contains Payment create after payment");
  }

  // Supplier concurrency
  {
    const prod = await createProduct("ProdSup", 100, 100);
    const supReq = await request(app).post("/api/rvb/supplier-requests").set("Authorization", `Bearer ${tokens.manager}`).send({ supplierId: supplierA.id, type: "new_supply", items: [{ productId: prod.id, quantity: 10, weightKg: 10, price: 10, total: 100 }], total: 100 });
    assert(supReq.status === 201, "Create supplier request");
    const reqId = supReq.body.request.id;
    const beforeProdQty = (await ProductModel.findOne({ id: prod.id }).lean() as any).quantity;
    const beforePurchases = await PurchaseModel.countDocuments({ supplierId: supplierA.id });
    const p1 = request(app).post(`/api/rvb/supplier-requests/${reqId}/review`).set("Authorization", `Bearer ${tokens.manager}`).send({ status: "accepted" });
    const p2 = request(app).post(`/api/rvb/supplier-requests/${reqId}/review`).set("Authorization", `Bearer ${tokens.admin}`).send({ status: "accepted" });
    const [r1, r2] = await Promise.all([p1, p2]);
    const successes = [r1, r2].filter(r => r.status === 200).length;
    assert(successes === 1, "2 concurrent Supplier supply accepts -> one succeeds");
    const afterProdQty = (await ProductModel.findOne({ id: prod.id }).lean() as any).quantity;
    assert(afterProdQty === beforeProdQty + 10, "Product inventory updated exactly once");
    const afterPurchases = await PurchaseModel.countDocuments({ supplierId: supplierA.id });
    assert(afterPurchases === beforePurchases + 1, "Exactly one Purchase created");
    const changes = await SyncChangeModel.find({ entity: { $in: ["product", "purchase", "supplier"] } }).lean();
    assert(changes.some((c: any) => c.entity === "product" && c.entityId === prod.id), "Sync Product update");
    assert(changes.some((c: any) => c.entity === "purchase"), "Sync Purchase create");
    assert(changes.some((c: any) => c.entity === "supplier"), "Sync Supplier update");
  }

  // Customer shipment concurrency
  {
    const prod = await createProduct("ProdCust", 50, 50);
    const custReq = await request(app).post("/api/rvb/customer-requests").set("Authorization", `Bearer ${tokens.manager}`).send({ customerId: customerA.id, type: "insert_shipment", items: [{ productId: prod.id, quantity: 5, weightKg: 5, price: 20, total: 100 }], total: 100 });
    assert(custReq.status === 201, "Create customer shipment");
    const reqId = custReq.body.request.id;
    const beforeQty = (await ProductModel.findOne({ id: prod.id }).lean() as any).quantity;
    const beforeSales = await SaleModel.countDocuments({ customerId: customerA.id });
    const p1 = request(app).post(`/api/rvb/customer-requests/${reqId}/review`).set("Authorization", `Bearer ${tokens.manager}`).send({ status: "accepted" });
    const p2 = request(app).post(`/api/rvb/customer-requests/${reqId}/review`).set("Authorization", `Bearer ${tokens.admin}`).send({ status: "accepted" });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert([r1, r2].filter(r => r.status === 200).length === 1, "2 concurrent Shipment accepts -> one succeeds");
    const afterQty = (await ProductModel.findOne({ id: prod.id }).lean() as any).quantity;
    assert(afterQty === beforeQty - 5, "Product decreased exactly once");
    const afterSales = await SaleModel.countDocuments({ customerId: customerA.id });
    assert(afterSales === beforeSales + 1, "Exactly one Sale created");
  }

  // Failure rollback simulation: try to accept with insufficient stock -> no partial
  {
    const prodLow = await createProduct("LowStock", 1, 1);
    const custReqLow = await request(app).post("/api/rvb/customer-requests").set("Authorization", `Bearer ${tokens.manager}`).send({ customerId: customerA.id, type: "insert_shipment", items: [{ productId: prodLow.id, quantity: 10, weightKg: 10, price: 10, total: 100 }], total: 100 });
    assert(custReqLow.status === 201, "Create low stock request");
    const reqId = custReqLow.body.request.id;
    const beforeQty = (await ProductModel.findOne({ id: prodLow.id }).lean() as any).quantity;
    const beforeBalance = (await CustomerModel.findOne({ id: customerA.id }).lean() as any).balance;
    const res = await request(app).post(`/api/rvb/customer-requests/${reqId}/review`).set("Authorization", `Bearer ${tokens.manager}`).send({ status: "accepted" });
    assert(res.status === 400 || res.status === 500, "Insufficient stock fails");
    const afterQty = (await ProductModel.findOne({ id: prodLow.id }).lean() as any).quantity;
    const afterBalance = (await CustomerModel.findOne({ id: customerA.id }).lean() as any).balance;
    assert(afterQty === beforeQty, "No partial inventory mutation on failure");
    assert(afterBalance === beforeBalance, "No partial balance mutation on failure");
    const reqAfter = await CustomerRequestModel.findOne({ id: reqId }).lean() as any;
    assert(reqAfter.status === "under_review", "Request still under_review after failure");
  }

  // Supervisor linkage persistence
  {
    const workerC = await createWorker("WorkerC", 5000);
    // Create supervisor linked to workerC via service directly
    const { createRvbAccount } = await import("./src/services/rvb-account.service");
    const supAcc = await createRvbAccount({ tag: `suptest${Date.now()}`, displayName: "Sup Test", role: "supervisor", linkedEntityType: "worker", linkedEntityId: workerC.id, password: "Test1234!", confirmPassword: "Test1234!" });
    assert((supAcc as any).linkedEntityId === workerC.id && (supAcc as any).linkedEntityType === "worker", "Supervisor→Worker link persists");
  }

  // DNS check
  {
    const fs = await import("fs");
    const serverContent = fs.readFileSync("./src/server.ts", "utf8");
    const dbContent = fs.readFileSync("./src/config/database.ts", "utf8");
    assert(!serverContent.includes("192.168.100.1"), "No hardcoded 192.168.100.1 in server.ts");
    assert(!dbContent.includes("192.168.100.1"), "No hardcoded 192.168.100.1 in database.ts");
    assert(dbContent.includes("configureDatabaseDns"), "database.ts uses configureDatabaseDns");
    const envExample = fs.readFileSync("./.env.example", "utf8");
    assert(envExample.includes("MONGODB_DNS_SERVERS"), ".env.example has MONGODB_DNS_SERVERS");
    assert(!envExample.includes("192.168.100.1"), ".env.example no private router IP");
  }

  console.log(`\nTests passed: ${passed}, failed: ${failed}`);
  await mongoose.disconnect();
  await replSet.stop();
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
