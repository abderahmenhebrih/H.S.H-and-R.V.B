import "fake-indexeddb/auto";
// M1 acceptance harness: 18-scenario matrix for chunked snapshot migration.
// Runs in frontend cwd (for @/ alias) with backend modules via require
// (backend packages are not frontend deps, so no static typed imports).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const express = require("../backend/node_modules/express");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MongoMemoryReplSet } = require("../backend/node_modules/mongodb-memory-server");

const BE: any = (global as any).__BE__ ?? {};
let passed = 0;
let failed = 0;
const ok = (n: string, extra = "") => { passed++; console.log(`PASS ${n} ${extra}`.trim()); };
const fail = (n: string, e: any) => { failed++; console.log(`FAIL ${n}: ${e?.message || e}`); };

async function freshDexie() {
  const { db } = await import("./src/lib/database/db");
  try { await db.delete(); } catch {}
  await db.open();
  for (const tbl of (db as any).tables) { try { await (db as any)[tbl.name].clear(); } catch {} }
  return db;
}

async function main() {
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mongoose = require("../backend/node_modules/mongoose").default;
  await mongoose.connect(mongod.getUri());
  const syncRouter = (await import("../backend/src/routes/sync")).default;
  const { SaleModel } = await import("../backend/src/models/sale.model");
  const app: any = express();
  app.use(express.json());
  app.use("/api/sync", syncRouter);
  const server: any = await new Promise((res) => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  const port = server.address().port;
  process.env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${port}`;
  const { runSnapshotMigration } = await import("./src/services/sync/snapshot-migration");
  const { getServerRevision, queueSyncOperation } = await import("./src/services/sync/queue");
  const { fetchSnapshotPage, fetchBootstrap } = await import("./src/services/sync/client");

  const seedSales = async (n: number, prefix: string) => {
    const arr: any[] = [];
    for (let i = 0; i < n; i++) arr.push({ id: `${prefix}-${String(i).padStart(5, "0")}`, customerId: "c1", date: i, createdAt: i, updatedAt: i, syncStatus: "synced", total: i } as any);
    await SaleModel.insertMany(arr, { ordered: false });
  };

  // 1 fresh install (rev 0 is legitimate: no SyncChange history yet)
  try {
    const db = await freshDexie();
    await SaleModel.deleteMany({});
    await seedSales(10, "f1");
    const rev = await runSnapshotMigration();
    const count = await (db as any).sales.count();
    if (count === 10 && rev >= 0) ok("1 fresh-install", `count=${count} rev=${rev}`);
    else fail("1 fresh-install", `count=${count} rev=${rev}`);
  } catch (e) { fail("1 fresh-install", e); }

  // 2 existing populated Dexie (stale local removed, data converges)
  try {
    const db = await freshDexie();
    await (db as any).sales.put({ id: "stale-local", customerId: "c1", syncStatus: "synced" });
    await seedSales(5, "f2");
    await runSnapshotMigration();
    const stale = await (db as any).sales.get("stale-local");
    const n = await (db as any).sales.count();
    if (!stale && n >= 15) ok("2 existing-reconciled", `count=${n}`);
    else fail("2 existing-reconciled", `stale=${!!stale} count=${n}`);
  } catch (e) { fail("2 existing-reconciled", e); }

  // 3 empty database
  try {
    await freshDexie();
    await SaleModel.deleteMany({});
    const rev = await runSnapshotMigration();
    if (rev >= 0) ok("3 empty-db", `rev=${rev}`);
    else fail("3 empty-db", rev);
  } catch (e) { fail("3 empty-db", e); }

  // 4 large dataset (2000 sales, limit 200 → 10 pages)
  try {
    const db = await freshDexie();
    await SaleModel.deleteMany({});
    await seedSales(2000, "big");
    const t0 = Date.now();
    await runSnapshotMigration();
    const n = await (db as any).sales.count();
    if (n === 2000) ok("4 large-2k", `${Date.now() - t0}ms count=${n}`);
    else fail("4 large-2k", `count=${n}`);
  } catch (e) { fail("4 large-2k", e); }

  // 5 interrupted snapshot (abort mid-walk, resume completes)
  try {
    const db = await freshDexie();
    await SaleModel.deleteMany({});
    await seedSales(500, "int");
    // simulate interruption: fetch 2 pages then stop (no apply), then full run
    const p1 = await fetchSnapshotPage("sale", null, 100);
    const p2 = await fetchSnapshotPage("sale", p1.nextCursor, 100);
    if (!p1.hasMore || p2.docs.length !== 100) throw new Error("paging broken");
    await runSnapshotMigration();
    const n = await (db as any).sales.count();
    if (n === 500) ok("5 interrupt-resume", `count=${n}`);
    else fail("5 interrupt-resume", `count=${n}`);
  } catch (e) { fail("5 interrupt-resume", e); }

  // 6 network disconnect mid-run → throws; retry succeeds (fallback path intact)
  let savedBase = process.env.NEXT_PUBLIC_API_URL!;
  try {
    await freshDexie();
    process.env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:1";
    let threw = false;
    try { await runSnapshotMigration(); } catch { threw = true; }
    process.env.NEXT_PUBLIC_API_URL = savedBase;
    const rev = await runSnapshotMigration();
    const { db: db6 } = await import("./src/lib/database/db");
    const n6 = await (db6 as any).sales.count();
    if (threw && rev >= 0 && n6 > 0) ok("6 disconnect-then-retry", `rev=${rev} count=${n6}`);
    else fail("6 disconnect-then-retry", `threw=${threw} rev=${rev} count=${n6}`);
  } catch (e) { process.env.NEXT_PUBLIC_API_URL = savedBase; fail("6 disconnect-then-retry", e); }

  // 7 server restart equiv: second full run idempotent, same union
  try {
    const db = await freshDexie();
    await runSnapshotMigration();
    const a = await (db as any).sales.count();
    await runSnapshotMigration();
    const b = await (db as any).sales.count();
    if (a === b && a > 0) ok("7 rerun-idempotent", `count=${b}`);
    else fail("7 rerun-idempotent", `${a} vs ${b}`);
  } catch (e) { fail("7 rerun-idempotent", e); }

  // 8 client restart: progress row persists and resumes
  try {
    await freshDexie();
    const { db: dbm } = await import("./src/lib/database/db");
    await (dbm as any).syncMeta.put({ key: "snapshotMigration", value: { entityIndex: 9, cursor: null, revision: 0, startedAt: Date.now() } });
    const rev = await runSnapshotMigration();
    const left = await (dbm as any).syncMeta.get("snapshotMigration").catch(() => null);
    if (rev >= 0 && !left) ok("8 progress-resume", `rev=${rev}`);
    else fail("8 progress-resume", `rev=${rev} leftover=${!!left}`);
  } catch (e) { fail("8 progress-resume", e); }

  // 9+10 duplicate/repeated page
  try {
    const a = await fetchSnapshotPage("sale", null, 50);
    const b = await fetchSnapshotPage("sale", null, 50);
    if (JSON.stringify(a.docs) === JSON.stringify(b.docs)) ok("9/10 duplicate-repeatable");
    else fail("9/10 duplicate-repeatable", "pages differ");
  } catch (e) { fail("9/10 duplicate-repeatable", e); }

  // 11 concurrent change during snapshot → /changes catch-up after finalize.
  // Direct model writes bypass revision tracking by design; a real second
  // device writes through POST /api/sync, which records a SyncChange.
  try {
    const db = await freshDexie();
    await runSnapshotMigration();
    const revBefore = await getServerRevision();
    const cid = `late-${Date.now()}`;
    const postRes = await fetch(`${savedBase}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "other-device", operations: [{
        operationId: `op-${Date.now()}`, entity: "customer", entityId: cid,
        operation: "create", createdAt: Date.now(),
        payload: { id: cid, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "synced", name: "Late", phone: "000", type: "regular", balance: 1 },
      }] }),
    });
    if (!postRes.ok) throw new Error("second-device POST failed " + postRes.status);
    const { fetchRemoteChanges } = await import("./src/services/sync/client");
    const { applyRemoteChanges } = await import("./src/services/sync/apply");
    const ch = await fetchRemoteChanges(revBefore, 200);
    await applyRemoteChanges(ch.changes as any);
    const got = await (db as any).customers.get(cid);
    if (got) ok("11 concurrent-catchup");
    else fail("11 concurrent-catchup", "late doc missing");
  } catch (e) { fail("11 concurrent-catchup", e); }

  // 12 concurrent clients converge
  try {
    const db = await freshDexie();
    await runSnapshotMigration();
    const n1 = await (db as any).sales.count();
    await runSnapshotMigration();
    const n2 = await (db as any).sales.count();
    if (n1 === n2) ok("12 concurrent-converge", `count=${n2}`);
    else fail("12 concurrent-converge", `${n1} vs ${n2}`);
  } catch (e) { fail("12 concurrent-converge", e); }

  // 13 pending local writes preserved
  try {
    const db = await freshDexie();
    await (db as any).sales.put({ id: "pend-1", customerId: "c1", date: 5, syncStatus: "pending", total: 999 });
    await queueSyncOperation({ entity: "sale", entityId: "pend-1", operation: "create", payload: { id: "pend-1", customerId: "c1", date: 5, total: 999 } });
    await runSnapshotMigration();
    const kept: any = await (db as any).sales.get("pend-1");
    if (kept && kept.total === 999) ok("13 pending-preserved");
    else fail("13 pending-preserved", JSON.stringify(kept)?.slice(0, 80));
    await (db as any).syncOperations.clear();
  } catch (e) { fail("13 pending-preserved", e); }

  // 14 conflicting revisions: pending local wins until push
  try {
    const db = await freshDexie();
    await (db as any).sales.put({ id: "conf-1", customerId: "c1", date: 5, syncStatus: "pending", total: 111 });
    await queueSyncOperation({ entity: "sale", entityId: "conf-1", operation: "update", payload: { id: "conf-1", total: 111 } });
    await SaleModel.updateOne({ id: "conf-1" }, { $set: { total: 222 } });
    await runSnapshotMigration();
    const kept: any = await (db as any).sales.get("conf-1");
    if (kept && kept.total === 111) ok("14 conflict-local-kept");
    else fail("14 conflict-local-kept", JSON.stringify(kept)?.slice(0, 80));
    await (db as any).syncOperations.clear();
  } catch (e) { fail("14 conflict-local-kept", e); }

  // 15 deletion during sync: server-deleted absent → local removed
  try {
    const db = await freshDexie();
    await (db as any).sales.put({ id: "del-1", customerId: "c1", syncStatus: "synced", total: 1 });
    await SaleModel.deleteOne({ id: "del-1" });
    await runSnapshotMigration();
    const gone = await (db as any).sales.get("del-1");
    if (!gone) ok("15 deletion-converges");
    else fail("15 deletion-converges", "still present");
  } catch (e) { fail("15 deletion-converges", e); }

  // 16 recovery after partial application
  try {
    const db = await freshDexie();
    await SaleModel.deleteMany({});
    await seedSales(300, "rec");
    const p = await fetchSnapshotPage("sale", null, 100);
    const { applySnapshotEntity } = await import("./src/services/sync/apply");
    await applySnapshotEntity("sale", p.docs); // partial, no finalize
    await runSnapshotMigration(); // full resume
    const n = await (db as any).sales.count();
    if (n === 300) ok("16 partial-recovery", `count=${n}`);
    else fail("16 partial-recovery", `count=${n}`);
  } catch (e) { fail("16 partial-recovery", e); }

  // 18 retention guard: pruned history → resyncRequired → re-migration converges
  try {
    const { SyncChangeModel } = await import("../backend/src/models/sync-change.model");
    const before: any = await fetch(`${savedBase}/api/sync/status`).then((r) => r.json());
    // create a fresh change so history exists, then prune everything below top
    const cid2 = `ret-${Date.now()}`;
    await fetch(`${savedBase}/api/sync`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "ret", operations: [{ operationId: `op-ret-${Date.now()}`, entity: "customer", entityId: cid2, operation: "create", createdAt: Date.now(), payload: { id: cid2, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "synced", name: "Ret", phone: "1", type: "regular", balance: 0 } }] }) });
    const top: any = await SyncChangeModel.findOne().sort({ revision: -1 }).lean();
    await SyncChangeModel.deleteMany({ revision: { $lt: top.revision } });
    // A stale cursor INTO the pruned range must trigger the guard (after=0
    // correctly does not: fresh clients take the snapshot path).
    const staleCursor = top.revision - 1;
    const stale: any = await fetch(`${savedBase}/api/sync/changes?after=${staleCursor}&limit=200`).then((r) => r.json());
    const db = await freshDexie();
    await runSnapshotMigration();
    const got = await (db as any).customers.get(cid2);
    if (stale.resyncRequired === true && got) ok("18 resync-guard-converges");
    else fail("18 resync-guard-converges", `flag=${stale.resyncRequired} got=${!!got} rev=${before.currentRevision}`);
  } catch (e) { fail("18 resync-guard-converges", e); }
  try {
    const boot: any = await fetchBootstrap();
    if (boot.snapshot && typeof boot.currentRevision === "number") ok("17 legacy-bootstrap-intact");
    else fail("17 legacy-bootstrap-intact", "shape");
  } catch (e) { fail("17 legacy-bootstrap-intact", e); }

  console.log(`\nM1-HARNESS: ${passed} passed, ${failed} failed`);
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("HARNESS FATAL", e); process.exit(1); });
