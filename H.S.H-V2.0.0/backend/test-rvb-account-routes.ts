import mongoose from "mongoose";
import express from "express";
import request from "supertest";

// We will test routes without real DB by mocking models, OR try to spin in-memory mongo via mongoose directly
// Simpler: mock mongoose models with in-memory arrays

// Mock DB: use fake collections
const mem: Record<string, any[]> = {
  workers: [{ id: "w1", name: "Worker One" }],
  suppliers: [{ id: "s1", name: "Supplier One" }],
  customers: [{ id: "c1", name: "Customer One" }],
};

// We'll patch the service to avoid real DB calls by mocking RvbAccountModel
// Instead, test via direct service calls with mocked RvbAccountModel

import * as svc from "./src/services/rvb-account.service";
import { RvbAccountModel } from "./src/models/rvb-account.model";
import { WorkerModel } from "./src/models/worker.model";
import { SupplierModel } from "./src/models/supplier.model";
import { CustomerModel } from "./src/models/customer.model";

async function mockModels() {
  // Override RvbAccountModel methods with in-memory store
  const store: any[] = [];
  const originalFindOne = RvbAccountModel.findOne.bind(RvbAccountModel);
  const originalCreate = RvbAccountModel.create.bind(RvbAccountModel);
  const originalDeleteMany = RvbAccountModel.deleteMany.bind(RvbAccountModel);

  // Patch findOne to look in store plus real DB? We'll intercept
  (RvbAccountModel as any).findOne = (filter: any) => {
    // Handle tag duplicate and linkedEntity checks via store
    // If store has matching, return it; otherwise fall back to original (which will hit empty DB)
    const found = store.find((doc) => {
      if (filter.tag && doc.tag === filter.tag) return true;
      if (filter.id && doc.id === filter.id) return true;
      if (filter.linkedEntityType && filter.linkedEntityType === doc.linkedEntityType && filter.linkedEntityId && filter.linkedEntityId === doc.linkedEntityId) return true;
      return false;
    });
    if (found) {
      return {
        lean: () => Promise.resolve(found),
        exec: () => Promise.resolve(found),
        then: undefined,
        // For update paths, we need mongoose doc with save()
        // We'll make findOne return a doc-like object when called without .lean() in update/archive flows
      } as any;
    }
    // For mongoose doc paths (archive etc), we need to search store and return doc with save
    // Check if caller expects doc (no lean)
    // We'll return a thenable that resolves to null for lean case, but for doc case we need save()
    // To handle both, we return an object with lean() and also directly acts as promise for doc
    const query: any = {
      lean: () => Promise.resolve(found || null),
      exec: () => Promise.resolve(found || null),
    };
    // Make it thenable for direct await (findOne without lean)
    query.then = (resolve: any, reject: any) => {
      if (found) {
        // Return doc with save()
        const doc = { ...found, save: async function() { Object.assign(found, this); return this; }, toObject: () => found };
        // Also update store reference
        resolve(doc);
      } else {
        resolve(null);
      }
      return { catch: () => {} } as any;
    };
    // But if filter is for tag check with lean, we already handled
    // For doc fetch, we need to support findOne({id}) without lean
    // We'll patch to return doc-like for those
    if (filter.id || filter.linkedEntityType) {
      const docFound = store.find((d) => {
        if (filter.id && d.id === filter.id) return true;
        if (filter.linkedEntityType && filter.linkedEntityType === d.linkedEntityType && filter.linkedEntityId === d.linkedEntityId) return true;
        return false;
      });
      if (docFound) {
        const docWithSave: any = { ...docFound, save: async function() { Object.assign(docFound, this); return this; }, toObject: () => docFound };
        const q2: any = {
          lean: () => Promise.resolve(docFound),
          exec: () => Promise.resolve(docFound),
          then: (res: any) => { res(docWithSave); return { catch: () => {} } as any; }
        };
        // For direct await, return docWithSave
        // We need to make (await RvbAccountModel.findOne({id})) work
        // So we make the query itself resolve to docWithSave when awaited
        // Trick: return a promise-like
        return {
          lean: () => Promise.resolve(docFound),
          exec: () => Promise.resolve(docWithSave),
          then: (onFulfill: any) => Promise.resolve(docWithSave).then(onFulfill),
          catch: (onReject: any) => Promise.resolve(docWithSave).catch(onReject),
        } as any;
      }
    }
    return query;
  };

  (RvbAccountModel as any).create = async (doc: any) => {
    const toStore = Array.isArray(doc) ? doc[0] : doc;
    const stored = { ...toStore, _id: `mock_${store.length}`, save: async function() { return this; }, toObject: function() { return this; } };
    store.push(stored);
    // Return like mongoose creates
    if (Array.isArray(doc)) return [stored];
    return stored;
  };

  // Also mock Worker/Supplier/Customer findOne to return from mem
  (WorkerModel as any).findOne = (filter: any) => ({
    lean: () => Promise.resolve(mem.workers.find((w) => w.id === filter.id) || null)
  } as any);
  (SupplierModel as any).findOne = (filter: any) => ({
    lean: () => Promise.resolve(mem.suppliers.find((s) => s.id === filter.id) || null)
  } as any);
  (CustomerModel as any).findOne = (filter: any) => ({
    lean: () => Promise.resolve(mem.customers.find((c) => c.id === filter.id) || null)
  } as any);

  return { store, restore: () => {
    (RvbAccountModel as any).findOne = originalFindOne;
    (RvbAccountModel as any).create = originalCreate;
  }};
}

async function main() {
  const { store } = await mockModels();

  const results: [string, boolean, string?][] = [];
  function record(name: string, ok: boolean, detail?: string) {
    results.push([name, ok, detail]);
    console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
  }

  let workerAcc: any = null;
  try {
    workerAcc = await svc.createRvbAccount({ tag: "test.worker.x1", displayName: "Worker One", role: "worker", linkedEntityType: "worker", linkedEntityId: "w1" });
    record("A. Create Worker account linked", !!workerAcc && workerAcc.role === "worker", `tag=${workerAcc.tag}`);
  } catch (e: any) { record("A. Create Worker account linked", false, e.code || e.message); }

  try {
    await svc.createRvbAccount({ tag: "another.tag.x1", displayName: "Worker One", role: "worker", linkedEntityType: "worker", linkedEntityId: "w1" });
    record("B. Duplicate entity link should fail", false, "no throw");
  } catch (e: any) { record("B. Duplicate entity link should fail", e.code === "RVB_ENTITY_ALREADY_LINKED", `code=${e.code}`); }

  try {
    await svc.createRvbAccount({ tag: "test.worker.x1", displayName: "Dup", role: "manager" });
    record("C. Duplicate tag should fail", false, "no throw");
  } catch (e: any) { record("C. Duplicate tag should fail", e.code === "RVB_TAG_ALREADY_EXISTS", `code=${e.code}`); }

  try {
    await svc.createRvbAccount({ tag: "ab", displayName: "Invalid", role: "manager" });
    record("D. Invalid tag should fail", false, "no throw");
  } catch (e: any) { record("D. Invalid tag should fail", e.code === "RVB_TAG_INVALID", `code=${e.code}`); }

  try {
    await svc.createRvbAccount({ tag: "mismatch.x1", displayName: "Mismatch", role: "worker", linkedEntityType: "customer", linkedEntityId: "c1" });
    record("E. Role/entity mismatch should fail", false, "no throw");
  } catch (e: any) { record("E. Role/entity mismatch should fail", e.code === "RVB_ENTITY_ROLE_MISMATCH", `code=${e.code}`); }

  try {
    await svc.createRvbAccount({ tag: "unknown.x1", displayName: "Unknown", role: "worker", linkedEntityType: "worker", linkedEntityId: "nonexistent" });
    record("F. Unknown linked entity should fail", false, "no throw");
  } catch (e: any) { record("F. Unknown linked entity should fail", e.code === "RVB_LINKED_ENTITY_NOT_FOUND", `code=${e.code}`); }

  let mgrAcc: any = null;
  try {
    mgrAcc = await svc.createRvbAccount({ tag: "mgr.x1", displayName: "Test Manager", role: "manager" });
    record("G. Management account without link", !!mgrAcc && mgrAcc.role === "manager" && mgrAcc.linkedEntityType === null, `id=${mgrAcc.id}`);
  } catch (e: any) { record("G. Management account without link", false, e.code || e.message); }

  if (mgrAcc) {
    try {
      const archived = await svc.archiveRvbAccount(mgrAcc.id);
      record("H. Archive", (archived as any).status === "archived" && (archived as any).archivedAt != null, `status=${(archived as any).status}`);
    } catch (e: any) { record("H. Archive", false, e.code || e.message); }
    try {
      const reactivated = await svc.reactivateRvbAccount(mgrAcc.id);
      record("I. Reactivate", (reactivated as any).status === "active" && (reactivated as any).archivedAt == null, `status=${(reactivated as any).status}`);
    } catch (e: any) { record("I. Reactivate", false, e.code || e.message); }
    try {
      const disabled = await svc.disableRvbAccount(mgrAcc.id);
      record("J. Disable", (disabled as any).status === "disabled", `status=${(disabled as any).status}`);
    } catch (e: any) { record("J. Disable", false, e.code || e.message); }
  } else {
    record("H. Archive", false, "mgrAcc not created");
    record("I. Reactivate", false, "mgrAcc not created");
    record("J. Disable", false, "mgrAcc not created");
  }

  try {
    const rawTag = "  @Ahmed.B_X1  ";
    const normAcc = await svc.createRvbAccount({ tag: rawTag, displayName: "Norm Test", role: "manager" });
    const expected = rawTag.trim().toLowerCase().replace(/^@/, "").trim();
    record("K. Tag normalization", (normAcc as any).tag === expected, `stored=${(normAcc as any).tag} expected=${expected}`);
  } catch (e: any) { record("K. Tag normalization", false, e.code || e.message); }

  const passed = results.filter(([, ok]) => ok).length;
  const total = results.length;
  console.log(`\n=== RESULTS: ${passed}/${total} passed ===`);
  for (const [name, ok, detail] of results) if (!ok) console.log(` FAILED: ${name} — ${detail}`);
  process.exit(passed === total ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
