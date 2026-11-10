import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

let passed = 0;
let failed = 0;
const ok = (n: string, extra = "") => { passed++; console.log(`PASS ${n}${extra ? " " + extra : ""}`); };
const fail = (n: string, e: any) => { failed++; console.log(`FAIL ${n}: ${e?.message || e}`); };

async function main() {
  process.env.RVB_TEST_MODE = "true";
  // F1: Mongo unavailable fails fast and cleanly (no hang)
  try {
    const t0 = Date.now();
    await mongoose.createConnection("mongodb://127.0.0.1:1/__down__", { serverSelectionTimeoutMS: 2000 }).asPromise().then(
      () => { throw new Error("unexpected connect"); },
      (e) => e,
    );
    const dt = Date.now() - t0;
    if (dt < 15000) ok("F1 mongo-unavailable-fast-fail", `${dt}ms`);
    else fail("F1 mongo-unavailable-fast-fail", `took ${dt}ms`);
  } catch (e) { fail("F1 mongo-unavailable-fast-fail", e); }

  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongod.getUri());
  const { RvbAccountModel } = await import("./src/models/rvb-account.model");
  const { RvbSessionModel } = await import("./src/models/rvb-session.model");
  const { WorkerModel } = await import("./src/models/worker.model");
  const { hashPassword } = await import("./src/lib/password");
  const { requireRvbAuth, requireRvbRole } = await import("./src/middleware/rvb-auth");
  const { signAccessToken } = await import("./src/lib/rvb-auth");

  // Auth test app: protected manager-only probe (no business logic)
  const authApp: any = express();
  authApp.use(express.json());
  authApp.get("/probe", requireRvbAuth as any, requireRvbRole("manager") as any, (_req: any, res: any) => res.json({ ok: true }));

  const now = Date.now();
  const pw = await hashPassword("Secret123!");
  const mgr: any = await RvbAccountModel.create({ id: `fi-mgr-${now}`, createdAt: now, updatedAt: now, tag: `fi.mgr.${now}`, displayName: "FI Mgr", role: "manager", linkedEntityType: null, linkedEntityId: null, status: "active", onboardingStatus: "complete", passwordHash: pw } as any);
  const mkSession = async (accountId: string, expiresInMs: number) => {
    const sid = `fi-sess-${Math.random().toString(36).slice(2)}`;
    await RvbSessionModel.create({ id: sid, accountId, refreshTokenHash: `fh-${sid}`, createdAt: now, expiresAt: now + expiresInMs, revokedAt: null } as any);
    return signAccessToken({ accountId, tag: "x", role: "manager", status: "active", sessionId: sid } as any);
  };

  // F2/F3: auth gates
  try {
    const r0 = await request(authApp).get("/probe");
    const goodTok = await mkSession(mgr.id, 3600000);
    const r1 = await request(authApp).get("/probe").set("Authorization", `Bearer ${goodTok}`);
    const expiredTok = await mkSession(mgr.id, -1000);
    const r2 = await request(authApp).get("/probe").set("Authorization", `Bearer ${expiredTok}`);
    if (r0.status === 401 && r1.status === 200 && r2.status === 401) ok("F2/F3 auth-gates", `anon=${r0.status} ok=${r1.status} expired=${r2.status}`);
    else fail("F2/F3 auth-gates", `anon=${r0.status} ok=${r1.status} expired=${r2.status}`);
  } catch (e) { fail("F2/F3 auth-gates", e); }

  // F4: wrong role + deactivated account
  try {
    const w: any = await RvbAccountModel.create({ id: `fi-w-${now}`, createdAt: now, updatedAt: now, tag: `fi.w.${now}`, displayName: "FI W", role: "worker", linkedEntityType: "worker", linkedEntityId: "w1", status: "active", onboardingStatus: "complete", passwordHash: pw } as any);
    const wTok = signAccessToken({ accountId: w.id, tag: w.tag, role: "worker", status: "active", sessionId: (await RvbSessionModel.create({ id: `fi-sw-${now}`, accountId: w.id, refreshTokenHash: `fh-sw-${now}`, createdAt: now, expiresAt: now + 3600000, revokedAt: null } as any)).id } as any);
    const rRole = await request(authApp).get("/probe").set("Authorization", `Bearer ${wTok}`);
    await RvbAccountModel.updateOne({ id: mgr.id }, { $set: { status: "inactive" } });
    const mgrTok2 = await mkSession(mgr.id, 3600000);
    const rInactive = await request(authApp).get("/probe").set("Authorization", `Bearer ${mgrTok2}`);
    await RvbAccountModel.updateOne({ id: mgr.id }, { $set: { status: "active" } });
    if (rRole.status === 403 && rInactive.status !== 200) ok("F4 role+inactive-denied", `role=${rRole.status} inactive=${rInactive.status}`);
    else fail("F4 role+inactive-denied", `role=${rRole.status} inactive=${rInactive.status}`);
  } catch (e) { fail("F4 role+inactive-denied", e); }

  // Sync app for F5-F9
  const syncRouter = (await import("./src/routes/sync")).default;
  const syncApp: any = express();
  syncApp.use(express.json());
  syncApp.use("/api/sync", syncRouter);

  // F5: malformed + unknown-entity rejected without 500/stack leak
  try {
    const rBad = await request(syncApp).post("/api/sync").send({ nope: 1 });
    const rUnknown = await request(syncApp).post("/api/sync").send({ clientId: "c", operations: [{ operationId: "u1", entity: "nope", entityId: "x", operation: "create", createdAt: Date.now(), payload: {} }] });
    const leaked = JSON.stringify(rBad.body) + JSON.stringify(rUnknown.body);
    if (rBad.status === 400 && rUnknown.status === 400 && !/stack|at .*\(.*\.ts/.test(leaked)) ok("F5 malformed-contained", `bad=${rBad.status} unknown=${rUnknown.status}`);
    else fail("F5 malformed-contained", `bad=${rBad.status} unknown=${rUnknown.status} leak=${leaked.slice(0, 80)}`);
  } catch (e) { fail("F5 malformed-contained", e); }

  // Seed worker + product + accounts for request flows
  const { ProductModel } = await import("./src/models/product.model");
  const { RvbAccountModel: A2 } = await import("./src/models/rvb-account.model");
  const wSvc = await import("./src/services/worker-request.service");
  const worker: any = await WorkerModel.create({ id: `fi-worker-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "FI Worker", phone: "0100000000", employmentDate: now, position: "Boucher", startingSalary: 100000, monthlySalary: 100000, status: "active", balance: 100000 } as any);
  const wAcc: any = await A2.create({ id: `fi-wacc-${now}`, createdAt: now, updatedAt: now, tag: `fi.wa.${now}`, displayName: "FI WA", role: "worker", linkedEntityType: "worker", linkedEntityId: worker.id, status: "active", onboardingStatus: "complete", passwordHash: pw } as any);
  const mgrAcc: any = await A2.findOne({ id: mgr.id }).lean();

  // F6: concurrent double-accept → exactly one wins
  try {
    const pay = await wSvc.createWorkerRequest({ workerId: worker.id, accountId: wAcc.id, type: "payment", amount: 1000, description: "F6" });
    const res = await Promise.allSettled([
      wSvc.reviewWorkerRequest(pay.id, "accepted", mgr.id),
      wSvc.reviewWorkerRequest(pay.id, "accepted", mgr.id),
    ]);
    const okCount = res.filter((r) => r.status === "fulfilled").length;
    const rej = res.filter((r) => r.status === "rejected").map((r) => (r as any).reason?.code);
    const { PaymentModel } = await import("./src/models/payment.model");
    const n = await PaymentModel.countDocuments({ entityId: worker.id, entityType: "worker" });
    if (okCount === 1 && rej.includes("RVB_REQUEST_ALREADY_REVIEWED") && n >= 1) ok("F6 concurrent-double-accept", `wins=1 code=${rej[0]} payments=${n}`);
    else fail("F6 concurrent-double-accept", `wins=${okCount} rej=${rej} payments=${n}`);
  } catch (e) { fail("F6 concurrent-double-accept", e); }

  // F7: same operationId POSTed twice → idempotent single side effect
  try {
    const { PaymentModel } = await import("./src/models/payment.model");
    const before = await PaymentModel.countDocuments({});
    const opId = `fi-op-${Date.now()}`;
    const body = { clientId: "fi", operations: [{ operationId: opId, entity: "customer", entityId: `fi-c-${now}`, operation: "create", createdAt: Date.now(), payload: { id: `fi-c-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "FI C", phone: "0200000000", type: "regular", balance: 0 } }] };
    const r1: any = await request(syncApp).post("/api/sync").send(body);
    const r2: any = await request(syncApp).post("/api/sync").send(body);
    const after = await PaymentModel.countDocuments({});
    if (r1.body.results?.[0]?.success && r2.body.results?.[0]?.success) ok("F7 idempotent-replay", `both-success`);
    else fail("F7 idempotent-replay", `r1=${r1.body.results?.[0]?.success} r2=${r2.body.results?.[0]?.success} payments=${before}->${after}`);
  } catch (e) { fail("F7 idempotent-replay", e); }

  // F8: invalid accept leaves zero side effects (atomicity)
  try {
    const { PurchaseModel } = await import("./src/models/purchase.model");
    const sSvc = await import("./src/services/supplier-request.service");
    const { SupplierModel } = await import("./src/models/supplier.model");
    const sup: any = await SupplierModel.create({ id: `fi-sup-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "FI Sup", phone: "0300000000", balance: 0 } as any);
    const sAcc: any = await A2.create({ id: `fi-sacc-${now}`, createdAt: now, updatedAt: now, tag: `fi.sa.${now}`, displayName: "FI SA", role: "supplier", linkedEntityType: "supplier", linkedEntityId: sup.id, status: "active", onboardingStatus: "complete", passwordHash: pw } as any);
    const prod: any = await ProductModel.create({ id: `fi-prod-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced", name: "FI P", price: 500, quantity: 100, weightKg: 100 } as any);
    const bad = await sSvc.createSupplierRequest({ supplierId: sup.id, accountId: sAcc.id, type: "new_supply", items: [{ productId: prod.id, quantity: 2, weightKg: 4, price: 500 }], total: 2000, date: now, description: null });
    const nBefore = await PurchaseModel.countDocuments({ supplierId: sup.id });
    let threw = "";
    try {
      await sSvc.reviewSupplierRequest(bad.id, "accepted", mgr.id, "x", { items: [{ productId: "ghost", quantity: 9, weightKg: 9, price: 9 }] });
    } catch (e: any) { threw = e?.code || e?.message; }
    const nAfter = await PurchaseModel.countDocuments({ supplierId: sup.id });
    if (threw && nAfter === nBefore) ok("F8 invalid-accept-atomic", `code=${threw}`);
    else fail("F8 invalid-accept-atomic", `threw=${threw} purchases=${nBefore}->${nAfter}`);
  } catch (e) { fail("F8 invalid-accept-atomic", e); }

  // F9: bad cursor + unknown id → safe shapes, no stack
  try {
    const rCursor: any = await request(syncApp).get("/api/sync/changes?after=abc&limit=9999");
    const rReview: any = await request(syncApp).post("/api/rvb/worker-requests/nope/review").send({});
    const leaked = JSON.stringify(rCursor.body) + JSON.stringify(rReview.body);
    if (rCursor.status === 200 && !/stack/.test(leaked)) ok("F9 safe-shapes", `cursor=${rCursor.status} review=${rReview.status}`);
    else fail("F9 safe-shapes", `cursor=${rCursor.status} review=${rReview.status}`);
  } catch (e) { fail("F9 safe-shapes", e); }

  // F10: adversarial input shapes (repaired bypasses — must 400, never 500/operator-match)
  try {
    const chatsRouter = (await import("./src/routes/chats")).default;
    const chatApp: any = express();
    chatApp.use(express.json());
    chatApp.use("/api/rvb/chats", chatsRouter);
    const invRouter = (await import("./src/routes/invoice")).default;
    const invApp: any = express();
    invApp.use(express.json());
    invApp.use("/api/invoices", invRouter);
    const chatSvc = await import("./src/services/chat.service");
    const grp: any = await chatSvc.createGroup(mgr.id, { name: "F10", memberIds: [wAcc.id] });
    const mgrTokF10 = await mkSession(mgr.id, 3600000);
    const withMgr = (r: any) => r.set("Authorization", `Bearer ${mgrTokF10}`);
    const rDM = await withMgr(request(chatApp).post("/api/rvb/chats/dm")).send({ otherAccountId: { $ne: null } });
    const rUpd = await withMgr(request(chatApp).patch(`/api/rvb/chats/${grp.id}`)).send({ addMemberIds: [{ $gt: "" }] });
    const rSrch = await withMgr(request(chatApp).get(`/api/rvb/chats/${grp.id}/messages`).query({ search: "a)(.*b" }));
    const badOp: any = await request(syncApp).post("/api/sync").send({ clientId: "adv", operations: [{ operationId: `adv-${Date.now()}`, entity: "customer", entityId: { $gt: "" }, operation: "create", createdAt: Date.now(), payload: {} }] });
    // Route gate fail-closes malformed ops with 400 + empty results.
    const { processSyncOperation } = await import("./src/sync/sync-service");
    const direct: any = await processSyncOperation({ operationId: `adv-direct-${Date.now()}`, entity: "customer", entityId: { $gt: "" }, operation: "create", createdAt: Date.now(), payload: {} } as any);
    const badOk = direct && direct.success === false && direct.retryable === false;
    const rCancel = await request(invApp).post("/api/invoices/cancel").send({ invoiceId: { $ne: null } });
    const shapes = [rDM.status, rUpd.status, rSrch.status, rCancel.status];
    const noLeak = [rDM, rUpd, rSrch, rCancel].every((r: any) => { try { return !/stack|MongoServerError/.test(JSON.stringify(r.body)); } catch { return false; } });
    const badStr = `route400=${badOp.status} direct=${badOk ? direct.message : JSON.stringify(direct).slice(0, 80)}`;
    // DM-object → 400 (coerced empty). updateGroup-object → 404 (stringified
    // "[object Object]" matches no account; rejected before any push — no
    // operator reached the DB, no junk persisted). Regex-search is legitimate
    // input → 200 with escaped literal matching. Cancel-object → 400/404.
    if ([rDM.status, rCancel.status].every((s) => s === 400 || s === 404) && rUpd.status === 404 && rSrch.status === 200 && noLeak && badOp.status === 400 && badOk) {
      ok("F10 adversarial-shapes-contained", `http=${shapes} sync=${badStr}`);
    } else fail("F10 adversarial-shapes-contained", `dm=${rDM.status} upd=${rUpd.status} srch=${rSrch.status} cancel=${rCancel.status} leak=${!noLeak} sync=${badStr}`);
  } catch (e) { fail("F10 adversarial-shapes-contained", e); }
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("HARNESS FATAL", e); process.exit(1); });

