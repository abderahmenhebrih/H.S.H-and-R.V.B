import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { RvbAccountModel } from "./src/models/rvb-account.model";
import { WorkerModel } from "./src/models/worker.model";
import { CustomerModel } from "./src/models/customer.model";
import { SupplierModel } from "./src/models/supplier.model";
import {
  createRvbAccount,
  archiveRvbAccount,
  reactivateRvbAccount,
  disableRvbAccount,
} from "./src/services/rvb-account.service";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("No MONGODB_URI, using in-memory check: will test via logic without DB? Need DB for real tests.");
    console.log("Skipping DB tests, checking pure functions...");
    const { normalizeTag, isValidTag } = await import("./src/constants/rvb-account");
    const tests: [string, boolean][] = [];
    tests.push(["normalizeTag @Ahmed.B -> ahmed.b", normalizeTag("@Ahmed.B") === "ahmed.b"]);
    tests.push(["normalizeTag Ahmed.B -> ahmed.b", normalizeTag("Ahmed.B") === "ahmed.b"]);
    tests.push(["isValidTag ahmed.b true", isValidTag("ahmed.b") === true]);
    tests.push(["isValidTag ab false (too short)", isValidTag("ab") === false]);
    tests.push(["isValidTag a b false (space)", isValidTag("a b") === false]);
    tests.push(["isValidTag sarl_atlas true", isValidTag("sarl_atlas") === true]);
    tests.push(["isValidTag 123 valid", isValidTag("123") === true]);
    tests.push(["isValidTag .abc invalid start dot", isValidTag(".abc") === false]);
    for (const [name, ok] of tests) {
      console.log(`${ok ? "PASS" : "FAIL"}: ${name}`);
    }
    process.exit(tests.every(([, ok]) => ok) ? 0 : 1);
  }

  // Fail-closed: this suite wipes rvb_accounts. Never run against production.
  const { assertSafeTestDatabase } = await import("./src/lib/test-db-guard");
  assertSafeTestDatabase(uri);
  await mongoose.connect(uri);
  console.log("Connected to DB for RVB account tests");

  // Clean RVB accounts
  await RvbAccountModel.deleteMany({});
  console.log("Cleaned RVB accounts");

  // Ensure we have at least one worker, supplier, customer for linking tests
  let worker = await WorkerModel.findOne().lean();
  if (!worker) {
    const now = Date.now();
    worker = await WorkerModel.create({
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
    } as any).then((d: any) => d.toObject ? d.toObject() : d);
    console.log("Created test worker", worker.id);
  } else {
    console.log("Using existing worker", (worker as any).id);
  }

  let supplier = await SupplierModel.findOne().lean();
  if (!supplier) {
    const now = Date.now();
    supplier = await SupplierModel.create({
      id: `s-test-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      name: `Test Supplier ${Date.now()}`,
      phone: "0123456789",
      balance: 0,
    } as any).then((d: any) => d.toObject ? d.toObject() : d);
    console.log("Created test supplier", supplier.id);
  } else {
    console.log("Using existing supplier", (supplier as any).id);
  }

  let customer = await CustomerModel.findOne().lean();
  if (!customer) {
    const now = Date.now();
    customer = await CustomerModel.create({
      id: `c-test-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      name: `Test Customer ${Date.now()}`,
      phone: "0123456789",
      type: "Retail",
      balance: 0,
    } as any).then((d: any) => d.toObject ? d.toObject() : d);
    console.log("Created test customer", customer.id);
  } else {
    console.log("Using existing customer", (customer as any).id);
  }

  const results: [string, boolean, string?][] = [];
  function record(name: string, ok: boolean, detail?: string) {
    results.push([name, ok, detail]);
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  // A: Create Worker account linked to existing Worker → success
  let workerAcc: any = null;
  try {
    workerAcc = await createRvbAccount({
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

  // B: Create second account for same Worker → RVB_ENTITY_ALREADY_LINKED
  try {
    await createRvbAccount({
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

  // C: Duplicate tag → RVB_TAG_ALREADY_EXISTS
  try {
    await createRvbAccount({
      tag: workerAcc.tag,
      displayName: "Duplicate Tag Test",
      role: "manager",
    });
    record("C. Duplicate tag should fail", false, "did not throw");
  } catch (e: any) {
    record("C. Duplicate tag should fail", e?.code === "RVB_TAG_ALREADY_EXISTS", `code=${e?.code}`);
  }

  // D: Invalid tag → RVB_TAG_INVALID
  try {
    await createRvbAccount({
      tag: "ab",
      displayName: "Invalid Tag",
      role: "manager",
    });
    record("D. Invalid tag should fail", false, "did not throw");
  } catch (e: any) {
    record("D. Invalid tag should fail", e?.code === "RVB_TAG_INVALID", `code=${e?.code}`);
  }

  // Also test space tag
  try {
    await createRvbAccount({
      tag: "a b",
      displayName: "Invalid Tag Space",
      role: "manager",
    });
    record("D2. Invalid tag with space should fail", false, "did not throw");
  } catch (e: any) {
    record("D2. Invalid tag with space should fail", e?.code === "RVB_TAG_INVALID", `code=${e?.code}`);
  }

  // E: role worker + customer linkedEntityType → RVB_ENTITY_ROLE_MISMATCH
  try {
    await createRvbAccount({
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

  // F: unknown linked entity → RVB_LINKED_ENTITY_NOT_FOUND
  try {
    await createRvbAccount({
      tag: `unknown.${Date.now().toString().slice(-6)}`,
      displayName: "Unknown Entity",
      role: "worker",
      linkedEntityType: "worker",
      linkedEntityId: "nonexistent-id-12345",
    });
    record("F. Unknown linked entity should fail", false, "did not throw");
  } catch (e: any) {
    record("F. Unknown linked entity should fail", e?.code === "RVB_LINKED_ENTITY_NOT_FOUND", `code=${e?.code}`);
  }

  // G: Management account without linkedEntity → success
  let mgrAcc: any = null;
  try {
    mgrAcc = await createRvbAccount({
      tag: `mgr.${Date.now().toString().slice(-6)}`,
      displayName: "Test Manager",
      role: "manager",
    });
    record("G. Management account without link", !!mgrAcc && mgrAcc.role === "manager" && mgrAcc.linkedEntityType === null, `id=${mgrAcc?.id}`);
  } catch (e: any) {
    record("G. Management account without link", false, e?.code || e?.message);
  }

  // Test Supervisor too (admin retired: role=admin must be rejected)
  try {
    await createRvbAccount({
      tag: `adm.${Date.now().toString().slice(-6)}`,
      displayName: "Test Admin",
      role: "admin",
    });
    record("G2. Admin creation rejected", false, "did not throw");
  } catch (e: any) {
    record("G2. Admin creation rejected", e?.code === "RVB_ROLE_INVALID", `code=${e?.code}`);
  }

  // Supervisor must link to a Worker (canonical supervisor → worker mapping)
  try {
    await createRvbAccount({
      tag: `sup.${Date.now().toString().slice(-6)}`,
      displayName: "Test Supervisor",
      role: "supervisor",
    });
    record("G3. Supervisor without Worker rejected", false, "did not throw");
  } catch (e: any) {
    record("G3. Supervisor without Worker rejected", e?.code === "RVB_LINKED_ENTITY_REQUIRED", `code=${e?.code}`);
  }

  try {
    await createRvbAccount({
      tag: `supm.${Date.now().toString().slice(-6)}`,
      displayName: "Test Supervisor",
      role: "supervisor",
      linkedEntityType: "supplier",
      linkedEntityId: (supplier as any).id,
    });
    record("G3b. Supervisor linked to Supplier rejected", false, "did not throw");
  } catch (e: any) {
    record("G3b. Supervisor linked to Supplier rejected", e?.code === "RVB_ENTITY_ROLE_MISMATCH", `code=${e?.code}`);
  }

  try {
    const now2 = Date.now();
    const supWorker: any = await WorkerModel.create({
      id: `w-sup-${now2}`, createdAt: now2, updatedAt: now2, syncStatus: "synced",
      name: `Supervisor Worker ${now2}`, phone: "0123456789", employmentDate: now2,
      position: "Shift Lead", startingSalary: 12000, monthlySalary: 12000, status: "active", balance: 12000,
    } as any).then((d: any) => d.toObject ? d.toObject() : d);
    const supAcc = await createRvbAccount({
      tag: `sup.${Date.now().toString().slice(-6)}`,
      displayName: "Test Supervisor",
      role: "supervisor",
      linkedEntityType: "worker",
      linkedEntityId: supWorker.id,
    });
    record("G3c. Supervisor linked to Worker", !!supAcc && supAcc.role === "supervisor" && (supAcc as any).linkedEntityType === "worker", `id=${supAcc?.id}`);
  } catch (e: any) {
    record("G3c. Supervisor linked to Worker", false, e?.code || e?.message);
  }

  // H: Archive → archived
  if (mgrAcc) {
    try {
      const archived = await archiveRvbAccount(mgrAcc.id);
      record("H. Archive", (archived as any).status === "archived" && (archived as any).archivedAt != null, `status=${(archived as any).status}`);
    } catch (e: any) {
      record("H. Archive", false, e?.code || e?.message);
    }

    // I: Reactivate → active
    try {
      const reactivated = await reactivateRvbAccount(mgrAcc.id);
      record("I. Reactivate", (reactivated as any).status === "active" && (reactivated as any).archivedAt == null, `status=${(reactivated as any).status}`);
    } catch (e: any) {
      record("I. Reactivate", false, e?.code || e?.message);
    }

    // J: Disable → disabled
    try {
      const disabled = await disableRvbAccount(mgrAcc.id);
      record("J. Disable", (disabled as any).status === "disabled", `status=${(disabled as any).status}`);
    } catch (e: any) {
      record("J. Disable", false, e?.code || e?.message);
    }
  } else {
    record("H. Archive", false, "mgrAcc not created");
    record("I. Reactivate", false, "mgrAcc not created");
    record("J. Disable", false, "mgrAcc not created");
  }

  // Additional: tag normalization
  try {
    const rawTag = `  @Ahmed.B_${Date.now().toString().slice(-4)}  `;
    const normAcc = await createRvbAccount({
      tag: rawTag,
      displayName: "Normalization Test",
      role: "manager",
    });
    const expected = rawTag.trim().toLowerCase().replace(/^@/, "").trim();
    record("K. Tag normalization with @ and spaces", (normAcc as any).tag === expected, `stored=${(normAcc as any).tag} expected=${expected}`);
  } catch (e: any) {
    record("K. Tag normalization with @ and spaces", false, e?.code || e?.message);
  }

  // Cleanup test RVB accounts
  // Keep or delete? We'll delete test accounts by tag prefix to not pollute
  // await RvbAccountModel.deleteMany({ tag: /^(test\.|another\.|mismatch|unknown|mgr\.|adm\.|sup\.|ahmed)/ });

  const passed = results.filter(([, ok]) => ok).length;
  const total = results.length;
  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  for (const [name, ok, detail] of results) {
    if (!ok) console.log(`  FAILED: ${name} — ${detail}`);
  }

  await mongoose.disconnect();
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => {
  console.error("Test runner failed", e);
  process.exit(1);
});
