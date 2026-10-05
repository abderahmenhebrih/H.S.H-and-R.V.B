import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Focused lifecycle tests for permanent RVB account deletion.
// Covers: removal + session/recipient cleanup, linked-entity preservation,
// tag reuse, self-delete guard, last-manager guard, archived deletion, 404.
async function run() {
  let mongod: any = null;
  try {
    mongod = await MongoMemoryServer.create({ replSet: { count: 1 } });
    const rawUri = mongod.getUri();
    // Single-node memory replica sets reject retryable writes (transactions need this off).
    process.env.MONGODB_URI = rawUri.includes("?") ? `${rawUri}&retryWrites=false` : `${rawUri}?retryWrites=false`;
  } catch (e) {
    console.error("MongoMemoryServer unavailable, cannot run delete tests");
    console.error(e);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI as string);

  const { RvbAccountModel } = await import("./src/models/rvb-account.model");
  const { RvbSessionModel } = await import("./src/models/rvb-session.model");
  const { RvbNotificationRecipientModel } = await import("./src/models/rvb-notification-recipient.model");
  const { WorkerModel } = await import("./src/models/worker.model");
  const svc = await import("./src/services/rvb-account.service");

  let passed = 0;
  const ok = (n: string) => { passed++; console.log(`PASS ${n}`); };
  const eq = (a: any, b: any, n: string) => {
    if (a !== b) throw new Error(`FAIL ${n}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  };
  const errCode = async (fn: () => Promise<any>) => {
    try { await fn(); } catch (e: any) { return e?.code; }
    return "NO_THROW";
  };

  const now = Date.now();
  const mkWorker = async (suffix: string) => {
    const w: any = await WorkerModel.create({
      id: `w-del-${suffix}-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced",
      name: `Del Worker ${suffix}`, phone: "0123456789", employmentDate: now,
      position: "Helper", startingSalary: 1000, monthlySalary: 1000, status: "active", balance: 1000,
    });
    return w.toObject ? w.toObject() : w;
  };
  const mkSession = (accountId: string, suffix: string) =>
    RvbSessionModel.create({ id: `sess-${suffix}-${now}`, accountId, refreshTokenHash: `hash-${suffix}-${now}`, createdAt: now, expiresAt: now + 86400000 });
  const mkRecipient = (accountId: string, suffix: string) =>
    RvbNotificationRecipientModel.create({ id: `rcp-${suffix}-${now}`, notificationId: `notif-${suffix}`, accountId, createdAt: now, updatedAt: now });

  // 1. Solo manager cannot be deleted (last-management-account guard)
  const solo: any = await svc.createRvbAccount({ tag: "solomgr", displayName: "Solo", role: "manager", password: "Password123", confirmPassword: "Password123" });
  eq(await errCode(() => svc.deleteRvbAccount(solo.id, "someone-else"),), "RVB_LAST_MANAGER", "solo manager delete blocked");
  ok("last-management-account guard");

  // 2. With two managers, deletion proceeds; self-delete blocked
  const mgrB: any = await svc.createRvbAccount({ tag: "mgrb", displayName: "Mgr B", role: "manager", password: "Password123", confirmPassword: "Password123" });
  eq(await errCode(() => svc.deleteRvbAccount(mgrB.id, mgrB.id)), "RVB_CANNOT_DELETE_SELF", "self-delete blocked");
  ok("self-delete guard");

  // 3. Worker-linked account: sessions + recipients cleaned, worker intact, tag reusable
  const worker = await mkWorker("w1");
  const wacc: any = await svc.createRvbAccount({ tag: "qwacc", displayName: "Qwacc", role: "worker", linkedEntityType: "worker", linkedEntityId: (worker as any).id, password: "Password123", confirmPassword: "Password123" });
  await mkSession(wacc.id, "w1a");
  await mkSession(wacc.id, "w1b");
  await mkRecipient(wacc.id, "w1");
  const res = await svc.deleteRvbAccount(wacc.id, solo.id);
  eq(res.id, wacc.id, "delete returns id");
  eq(await RvbAccountModel.findOne({ id: wacc.id }).lean(), null, "account doc removed");
  eq(await RvbSessionModel.countDocuments({ accountId: wacc.id }), 0, "sessions removed");
  eq(await RvbNotificationRecipientModel.countDocuments({ accountId: wacc.id }), 0, "recipients removed");
  const workerAfter = await WorkerModel.findOne({ id: (worker as any).id }).lean();
  if (!workerAfter) throw new Error("FAIL linked worker was removed");
  ok("worker account deleted, worker preserved, sessions/recipients cleaned");

  const reuse: any = await svc.createRvbAccount({ tag: "qwacc", displayName: "Qwacc Two", role: "worker", linkedEntityType: "worker", linkedEntityId: (worker as any).id, password: "Password123", confirmPassword: "Password123" });
  eq(reuse.tag, "qwacc", "tag reusable after delete");
  ok("tag reuse");

  // 3b. Supplier-linked account: supplier record preserved
  const { SupplierModel } = await import("./src/models/supplier.model");
  const sup: any = await SupplierModel.create({
    id: `s-del-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced",
    name: `Del Supplier ${now}`, phone: "0123456789", balance: 0,
  });
  const supId = sup.toObject ? sup.toObject().id : sup.id;
  const sacc: any = await svc.createRvbAccount({ tag: "qadelsup", displayName: "Qadel Sup", role: "supplier", linkedEntityType: "supplier", linkedEntityId: supId, password: "Password123", confirmPassword: "Password123" });
  await svc.deleteRvbAccount(sacc.id, solo.id);
  eq(await RvbAccountModel.findOne({ id: sacc.id }).lean(), null, "supplier account removed");
  if (!await SupplierModel.findOne({ id: supId }).lean()) throw new Error("FAIL supplier record was removed");
  ok("supplier account deleted, supplier preserved");

  // 3c. Customer-linked account: customer record preserved
  const { CustomerModel } = await import("./src/models/customer.model");
  const cus: any = await CustomerModel.create({
    id: `c-del-${now}`, createdAt: now, updatedAt: now, syncStatus: "synced",
    name: `Del Customer ${now}`, phone: "0123456789", type: "consumer", balance: 0,
  });
  const cusId = cus.toObject ? cus.toObject().id : cus.id;
  const cacc: any = await svc.createRvbAccount({ tag: "qadelcus", displayName: "Qadel Cus", role: "customer", linkedEntityType: "customer", linkedEntityId: cusId, password: "Password123", confirmPassword: "Password123" });
  await svc.deleteRvbAccount(cacc.id, solo.id);
  eq(await RvbAccountModel.findOne({ id: cacc.id }).lean(), null, "customer account removed");
  if (!await CustomerModel.findOne({ id: cusId }).lean()) throw new Error("FAIL customer record was removed");
  ok("customer account deleted, customer preserved");

  // 4. Archived account can still be deleted
  await svc.archiveRvbAccount(reuse.id);
  await svc.deleteRvbAccount(reuse.id, solo.id);
  eq(await RvbAccountModel.findOne({ id: reuse.id }).lean(), null, "archived account deleted");
  ok("archived deletion");

  // 5. Missing account → 404
  eq(await errCode(() => svc.deleteRvbAccount("rvbacc-nope", solo.id)), "RVB_ACCOUNT_NOT_FOUND", "missing 404");
  ok("missing account 404");

  // 6. Second manager deletable while solo remains (guard counts correctly)
  await svc.deleteRvbAccount(mgrB.id, solo.id);
  eq(await RvbAccountModel.findOne({ id: mgrB.id }).lean(), null, "second manager deleted");
  ok("non-final manager deletion");

  console.log(`\nAll ${passed} account-delete checks passed.`);
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

run().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
