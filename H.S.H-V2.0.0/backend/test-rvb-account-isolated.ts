import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

async function run() {
  let mongod: any = null;
  try {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    process.env.MONGODB_URI = uri;
    console.log("Memory URI:", uri);
  } catch (e) {
    console.log("MongoMemoryServer not available, trying local fallback", e);
    // Try to use existing Mongo if available? Just skip to logic tests
  }

  const mongooseMod = await import("mongoose");
  const dotenvMod = await import("dotenv");
  // Need to load models after URI set
  const { RvbAccountModel } = await import("./src/models/rvb-account.model");
  const { WorkerModel } = await import("./src/models/worker.model");
  const { CustomerModel } = await import("./src/models/customer.model");
  const { SupplierModel } = await import("./src/models/supplier.model");
  const svc = await import("./src/services/rvb-account.service");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("No URI, running isolated logic only");
    const { normalizeTag, isValidTag } = await import("./src/constants/rvb-account");
    console.log(normalizeTag("@Ahmed.B") === "ahmed.b" ? "PASS normalize" : "FAIL normalize");
    console.log(isValidTag("ahmed.b") ? "PASS valid" : "FAIL valid");
    process.exit(0);
  }

  await mongooseMod.default.connect(uri);
  console.log("Connected to memory DB");

  await RvbAccountModel.deleteMany({});
  console.log("Cleaned RVB accounts");

  let worker = await WorkerModel.findOne().lean();
  if (!worker) {
    const now = Date.now();
    const created: any = await WorkerModel.create({
      id: `w-test-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      name: `Test Worker ${Date.now()}`,
      phone: "0123456789",
      employmentDate: now,
      position: "Test Position",
      startingSalary: 10000,
      monthlySalary: 10000,
      status: "active",
      balance: 10000,
    });
    worker = created.toObject ? created.toObject() : created;
    console.log("Created test worker", (worker as any).id);
  } else {
    console.log("Using worker", (worker as any).id);
  }

  let supplier = await SupplierModel.findOne().lean();
  if (!supplier) {
    const now = Date.now();
    const created: any = await SupplierModel.create({
      id: `s-test-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      name: `Test Supplier ${Date.now()}`,
      phone: "0123456789",
      balance: 0,
    });
    supplier = created.toObject ? created.toObject() : created;
    console.log("Created supplier", (supplier as any).id);
  }

  let customer = await CustomerModel.findOne().lean();
  if (!customer) {
    const now = Date.now();
    const created: any = await CustomerModel.create({
      id: `c-test-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      name: `Test Customer ${Date.now()}`,
      phone: "0123456789",
      type: "Retail",
      balance: 0,
    });
    customer = created.toObject ? created.toObject() : created;
    console.log("Created customer", (customer as any).id);
  }

  const results: [string, boolean, string?][] = [];
  function record(name: string, ok: boolean, detail?: string) {
    results.push([name, ok, detail]);
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  let workerAcc: any = null;
  try {
    workerAcc = await svc.createRvbAccount({
      tag: `test.worker.${Date.now().toString().slice(-6)}`,
      displayName: (worker as any).name,
      role: "worker",
      linkedEntityType: "worker",
      linkedEntityId: (worker as any).id,
    });
    record("A. Create Worker account", !!workerAcc && workerAcc.role === "worker", `id=${workerAcc?.id} tag=${workerAcc?.tag}`);
  } catch (e: any) {
    record("A. Create Worker account", false, e?.code || e?.message);
  }

  try {
    await svc.createRvbAccount({
      tag: `another.tag.${Date.now().toString().slice(-6)}`,
      displayName: (worker as any).name,
      role: "worker",
      linkedEntityType: "worker",
      linkedEntityId: (worker as any).id,
    });
    record("B. Duplicate entity link should fail", false, "did not throw");
  } catch (e: any) {
    record("B. Duplicate entity link should fail", e?.code === "RVB_ENTITY_ALREADY_LINKED", `code=${e?.code}`);
  }

  try {
    await svc.createRvbAccount({ tag: workerAcc.tag, displayName: "Dup Tag", role: "manager" });
    record("C. Duplicate tag should fail", false, "did not throw");
  } catch (e: any) {
    record("C. Duplicate tag should fail", e?.code === "RVB_TAG_ALREADY_EXISTS", `code=${e?.code}`);
  }

  try {
    await svc.createRvbAccount({ tag: "ab", displayName: "Invalid", role: "manager" });
    record("D. Invalid tag should fail", false, "did not throw");
  } catch (e: any) {
    record("D. Invalid tag should fail", e?.code === "RVB_TAG_INVALID", `code=${e?.code}`);
  }

  try {
    await svc.createRvbAccount({ tag: "a b", displayName: "Invalid Space", role: "manager" });
    record("D2. Invalid tag space should fail", false, "did not throw");
  } catch (e: any) {
    record("D2. Invalid tag space should fail", e?.code === "RVB_TAG_INVALID", `code=${e?.code}`);
  }

  try {
    await svc.createRvbAccount({
      tag: `mismatch.${Date.now().toString().slice(-6)}`,
      displayName: "Mismatch",
      role: "worker",
      linkedEntityType: "customer",
      linkedEntityId: (customer as any).id,
    });
    record("E. Role/entity mismatch should fail", false, "did not throw");
  } catch (e: any) {
    record("E. Role/entity mismatch should fail", e?.code === "RVB_ENTITY_ROLE_MISMATCH", `code=${e?.code}`);
  }

  try {
    await svc.createRvbAccount({
      tag: `unknown.${Date.now().toString().slice(-6)}`,
      displayName: "Unknown",
      role: "worker",
      linkedEntityType: "worker",
      linkedEntityId: "nonexistent-id-12345",
    });
    record("F. Unknown linked entity should fail", false, "did not throw");
  } catch (e: any) {
    record("F. Unknown linked entity should fail", e?.code === "RVB_LINKED_ENTITY_NOT_FOUND", `code=${e?.code}`);
  }

  let mgrAcc: any = null;
  try {
    mgrAcc = await svc.createRvbAccount({ tag: `mgr.${Date.now().toString().slice(-6)}`, displayName: "Test Manager", role: "manager" });
    record("G. Management account", !!mgrAcc && mgrAcc.role === "manager" && mgrAcc.linkedEntityType === null, `id=${mgrAcc?.id}`);
  } catch (e: any) {
    record("G. Management account", false, e?.code || e?.message);
  }

  try {
    await svc.createRvbAccount({ tag: `adm.${Date.now().toString().slice(-6)}`, displayName: "Test Admin", role: "admin" });
    record("G2. Admin creation rejected", false, "did not throw");
  } catch (e: any) {
    record("G2. Admin creation rejected", e?.code === "RVB_ROLE_INVALID", `code=${e?.code}`);
  }

  try {
    await svc.createRvbAccount({ tag: `sup.${Date.now().toString().slice(-6)}`, displayName: "Test Supervisor", role: "supervisor" });
    record("G3. Supervisor without Worker rejected", false, "did not throw");
  } catch (e: any) {
    record("G3. Supervisor without Worker rejected", e?.code === "RVB_LINKED_ENTITY_REQUIRED", `code=${e?.code}`);
  }

  try {
    await svc.createRvbAccount({ tag: `sup2.${Date.now().toString().slice(-6)}`, displayName: "Test Supervisor", role: "supervisor", linkedEntityType: "supplier", linkedEntityId: (supplier as any).id });
    record("G3b. Supervisor linked to Supplier rejected", false, "did not throw");
  } catch (e: any) {
    record("G3b. Supervisor linked to Supplier rejected", e?.code === "RVB_ENTITY_ROLE_MISMATCH", `code=${e?.code}`);
  }

  try {
    await svc.createRvbAccount({ tag: `sup3.${Date.now().toString().slice(-6)}`, displayName: "Test Supervisor", role: "supervisor", linkedEntityType: "worker", linkedEntityId: "nonexistent-worker-id" });
    record("G3c. Supervisor linked to invalid Worker rejected", false, "did not throw");
  } catch (e: any) {
    record("G3c. Supervisor linked to invalid Worker rejected", e?.code === "RVB_LINKED_ENTITY_NOT_FOUND", `code=${e?.code}`);
  }

  try {
    const now2 = Date.now();
    const supWorker: any = await WorkerModel.create({
      id: `w-sup-${now2}`, createdAt: now2, updatedAt: now2, syncStatus: "synced",
      name: `Supervisor Worker ${now2}`, phone: "0123456789", employmentDate: now2,
      position: "Shift Lead", startingSalary: 12000, monthlySalary: 12000, status: "active", balance: 12000,
    });
    const supWorkerId = supWorker.toObject ? supWorker.toObject().id : supWorker.id;
    const supAcc = await svc.createRvbAccount({ tag: `sup.${Date.now().toString().slice(-6)}`, displayName: "Test Supervisor", role: "supervisor", linkedEntityType: "worker", linkedEntityId: supWorkerId });
    record("G3d. Supervisor linked to Worker", !!supAcc && supAcc.role === "supervisor" && (supAcc as any).linkedEntityType === "worker" && (supAcc as any).linkedEntityId === supWorkerId, `id=${supAcc?.id}`);
    try {
      await svc.createRvbAccount({ tag: `supdup.${Date.now().toString().slice(-6)}`, displayName: "Dup Supervisor", role: "supervisor", linkedEntityType: "worker", linkedEntityId: supWorkerId });
      record("G3e. Second account on same Worker rejected", false, "did not throw");
    } catch (e2: any) {
      record("G3e. Second account on same Worker rejected", e2?.code === "RVB_ENTITY_ALREADY_LINKED", `code=${e2?.code}`);
    }
    // Unlink disables the supervisor (same orphan rule as portal roles); re-link restores access
    const unlinked: any = await svc.unlinkRvbAccount((supAcc as any).id);
    record("G3f. Unlink disables Supervisor", unlinked.status === "disabled" && !unlinked.linkedEntityId, `status=${unlinked.status}`);
  } catch (e: any) {
    record("G3d. Supervisor linked to Worker", false, e?.code || e?.message);
  }

  if (mgrAcc) {
    try {
      const archived = await svc.archiveRvbAccount(mgrAcc.id);
      record("H. Archive", (archived as any).status === "archived" && (archived as any).archivedAt != null, `status=${(archived as any).status}`);
    } catch (e: any) { record("H. Archive", false, e?.code || e?.message); }
    try {
      const reactivated = await svc.reactivateRvbAccount(mgrAcc.id);
      record("I. Reactivate", (reactivated as any).status === "active" && (reactivated as any).archivedAt == null, `status=${(reactivated as any).status}`);
    } catch (e: any) { record("I. Reactivate", false, e?.code || e?.message); }
    try {
      const disabled = await svc.disableRvbAccount(mgrAcc.id);
      record("J. Disable", (disabled as any).status === "disabled", `status=${(disabled as any).status}`);
    } catch (e: any) { record("J. Disable", false, e?.code || e?.message); }
  } else {
    record("H. Archive", false, "mgrAcc not created");
    record("I. Reactivate", false, "mgrAcc not created");
    record("J. Disable", false, "mgrAcc not created");
  }

  try {
    const rawTag = `  @Ahmed.B_${Date.now().toString().slice(-4)}  `;
    const normAcc = await svc.createRvbAccount({ tag: rawTag, displayName: "Normalization Test", role: "manager" });
    const expected = rawTag.trim().toLowerCase().replace(/^@/, "").trim();
    record("K. Tag normalization", (normAcc as any).tag === expected, `stored=${(normAcc as any).tag} expected=${expected}`);
  } catch (e: any) {
    record("K. Tag normalization", false, e?.code || e?.message);
  }

  const passed = results.filter(([, ok]) => ok).length;
  const total = results.length;
  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  for (const [name, ok, detail] of results) if (!ok) console.log(`  FAILED: ${name} — ${detail}`);

  await mongooseMod.default.disconnect();
  if (mongod) await mongod.stop();
  process.exit(passed === total ? 0 : 1);
}

run().catch((e) => { console.error("Runner failed", e); process.exit(1); });
