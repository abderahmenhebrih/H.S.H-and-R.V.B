import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";

async function run() {
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongod.waitUntilRunning();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  const { processSyncOperation } = await import("./src/sync/sync-service.ts");
  const { TaskModel } = await import("./src/models/task.model.ts");
  const { SyncChangeModel } = await import("./src/models/sync-change.model.ts");
  const { ProcessedSyncOperationModel } = await import("./src/models/processed-sync-operation.model.ts");
  const { SyncCounterModel } = await import("./src/models/sync-counter.model.ts");

  let passed = 0, failed = 0;
  const ok = (n: string) => { console.log(`✅ ${n}`); passed++; };
  const fail = (n: string, e: any) => { console.log(`❌ ${n}: ${e?.message || e}`); failed++; };
  const opId = () => `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const clean = async () => {
    await Promise.all([
      TaskModel.deleteMany({}),
      SyncChangeModel.deleteMany({}),
      ProcessedSyncOperationModel.deleteMany({}),
      SyncCounterModel.deleteMany({}),
    ]);
  };

  const createTaskOp = (entityId: string, name: string, deadline: number, clientId = "test") => ({
    operationId: opId(),
    entity: "task",
    entityId,
    operation: "create" as const,
    payload: { id: entityId, name, deadline, createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "pending", status: "pending" },
    clientId,
  });

  // 1. Create unfinished "Task X" then duplicate "Task X" → second fails TASK_NAME_DUPLICATE
  try {
    await clean();
    const r1 = await processSyncOperation(createTaskOp("t1", "Task X", Date.now() + 86400000) as any);
    if (!r1.success) throw new Error("first should succeed");
    const r2 = await processSyncOperation(createTaskOp("t2", "Task X", Date.now() + 86400000) as any);
    if (r2.success) throw new Error("second should fail");
    if (r2.error !== "TASK_NAME_DUPLICATE") throw new Error(`expected TASK_NAME_DUPLICATE got ${r2.error}`);
    if (r2.retryable !== false) throw new Error("should be retryable false");
    const count = await TaskModel.countDocuments({ status: { $ne: "completed" } });
    if (count !== 1) throw new Error(`final count 1 got ${count}`);
    const changes = await SyncChangeModel.find({ entity: "task", entityId: "t2" }).lean();
    if (changes.length !== 0) throw new Error("rejected duplicate should emit no SyncChange");
    ok("1. Duplicate exact → TASK_NAME_DUPLICATE");
  } catch (e) { fail("1. Duplicate", e); }

  // 2. Whitespace duplicate
  try {
    await clean();
    await processSyncOperation(createTaskOp("t1", "Task X", Date.now() + 86400000) as any);
    const r2 = await processSyncOperation(createTaskOp("t2", "   Task X   ", Date.now() + 86400000) as any);
    if (r2.success) throw new Error("whitespace duplicate should fail");
    if (r2.error !== "TASK_NAME_DUPLICATE") throw new Error(`expected duplicate got ${r2.error}`);
    ok("2. Whitespace duplicate → fail");
  } catch (e) { fail("2. Whitespace", e); }

  // 3. Case variant allowed
  try {
    await clean();
    const r1 = await processSyncOperation(createTaskOp("t1", "Task X", Date.now() + 86400000) as any);
    const r2 = await processSyncOperation(createTaskOp("t2", "task x", Date.now() + 86400000) as any);
    if (!r1.success || !r2.success) throw new Error("case variants should both succeed");
    const count = await TaskModel.countDocuments({ status: { $ne: "completed" } });
    if (count !== 2) throw new Error(`both case variants should exist count 2 got ${count}`);
    ok("3. Case variant allowed");
  } catch (e) { fail("3. Case variant", e); }

  // 4. Finished name reuse → success
  try {
    await clean();
    const r1 = await processSyncOperation(createTaskOp("t1", "Task X", Date.now() + 86400000) as any);
    if (!r1.success) throw new Error("first");
    // Complete t1 via update to completed
    const upd = await processSyncOperation({
      operationId: opId(),
      entity: "task",
      entityId: "t1",
      operation: "update",
      payload: { status: "completed", completedAt: Date.now() },
      clientId: "test",
    } as any);
    if (!upd.success) throw new Error("complete should succeed");
    const r2 = await processSyncOperation(createTaskOp("t2", "Task X", Date.now() + 86400000) as any);
    if (!r2.success) throw new Error("reuse after completed should succeed");
    const pending = await TaskModel.countDocuments({ status: { $ne: "completed" } });
    const completed = await TaskModel.countDocuments({ status: "completed" });
    if (pending !== 1 || completed !== 1) throw new Error(`pending 1 completed 1 got ${pending} ${completed}`);
    ok("4. Finished name reuse → success");
  } catch (e) { fail("4. Finished reuse", e); }

  // 5. Concurrent creates exact same name → one success, one fail, final count 1
  try {
    await clean();
    const opA = createTaskOp("tA", "QA Duplicate", Date.now() + 86400000, "clientA");
    const opB = createTaskOp("tB", "QA Duplicate", Date.now() + 86400000, "clientB");
    const [rA, rB] = await Promise.all([
      processSyncOperation(opA as any),
      processSyncOperation(opB as any),
    ]);
    const succ = [rA, rB].filter(r => r.success).length;
    if (succ !== 1) throw new Error(`expected 1 success got ${succ} rA ${rA.error} rB ${rB.error}`);
    const failOne = [rA, rB].find(r => !r.success);
    if (failOne?.error !== "TASK_NAME_DUPLICATE") throw new Error(`expected duplicate got ${failOne?.error}`);
    const count = await TaskModel.countDocuments({ status: { $ne: "completed" }, name: "QA Duplicate" });
    if (count !== 1) throw new Error(`final count 1 got ${count}`);
    ok("5. Concurrent exact → 1 success 1 fail");
  } catch (e) { fail("5. Concurrent", e); }

  // 6. Concurrent case variants → both success
  try {
    await clean();
    const opA = createTaskOp("tA2", "QA Duplicate", Date.now() + 86400000, "clientA");
    const opB = createTaskOp("tB2", "qa duplicate", Date.now() + 86400000, "clientB");
    const [rA, rB] = await Promise.all([
      processSyncOperation(opA as any),
      processSyncOperation(opB as any),
    ]);
    if (!rA.success || !rB.success) throw new Error("case variants concurrent should both succeed");
    ok("6. Concurrent case variants → both success");
  } catch (e) { fail("6. Concurrent case", e); }

  // 7. Update B → existing A name → reject, B unchanged
  try {
    await clean();
    await processSyncOperation(createTaskOp("tA3", "Task A", Date.now() + 86400000) as any);
    await processSyncOperation(createTaskOp("tB3", "Task B", Date.now() + 86400000) as any);
    const upd = await processSyncOperation({
      operationId: opId(),
      entity: "task",
      entityId: "tB3",
      operation: "update",
      payload: { name: "Task A" },
      clientId: "test",
    } as any);
    if (upd.success) throw new Error("update to duplicate should fail");
    if (upd.error !== "TASK_NAME_DUPLICATE") throw new Error(`expected duplicate got ${upd.error}`);
    const bAfter = await TaskModel.findOne({ id: "tB3" }).lean() as any;
    if (bAfter.name !== "Task B") throw new Error(`B should remain Task B got ${bAfter.name}`);
    ok("7. Update to duplicate → fail, unchanged");
  } catch (e) { fail("7. Update duplicate", e); }

  // 8. Update A without changing name → success (deadline change)
  try {
    await clean();
    const r1 = await processSyncOperation(createTaskOp("tU", "Task A", Date.now() + 86400000) as any);
    if (!r1.success) throw new Error("create");
    const upd = await processSyncOperation({
      operationId: opId(),
      entity: "task",
      entityId: "tU",
      operation: "update",
      payload: { deadline: Date.now() + 2 * 86400000 },
      clientId: "test",
    } as any);
    if (!upd.success) throw new Error("update without name change should succeed");
    ok("8. Update without name change → success");
  } catch (e) { fail("8. Update unchanged", e); }

  // 9. Update A with whitespace same name → success (stored trimmed)
  try {
    await clean();
    await processSyncOperation(createTaskOp("tW", "Task A", Date.now() + 86400000) as any);
    const upd = await processSyncOperation({
      operationId: opId(),
      entity: "task",
      entityId: "tW",
      operation: "update",
      payload: { name: "  Task A  " },
      clientId: "test",
    } as any);
    if (!upd.success) throw new Error("whitespace self should succeed");
    const after = await TaskModel.findOne({ id: "tW" }).lean() as any;
    if (after.name.trim() !== "Task A") throw new Error(`should remain Task A got ${after.name}`);
    ok("9. Update whitespace self → success");
  } catch (e) { fail("9. Whitespace self", e); }

  // 10. Restore conflict: completed task name reused by pending, then try to restore completed (update status pending) → fail
  try {
    await clean();
    await processSyncOperation(createTaskOp("tR1", "QA Restore", Date.now() + 86400000) as any);
    // Complete tR1
    await processSyncOperation({
      operationId: opId(),
      entity: "task",
      entityId: "tR1",
      operation: "update",
      payload: { status: "completed" },
      clientId: "test",
    } as any);
    // Create new pending with same name
    await processSyncOperation(createTaskOp("tR2", "QA Restore", Date.now() + 86400000) as any);
    // Try to restore tR1 (make pending again)
    const restore = await processSyncOperation({
      operationId: opId(),
      entity: "task",
      entityId: "tR1",
      operation: "update",
      payload: { status: "pending" },
      clientId: "test",
    } as any);
    if (restore.success) throw new Error("restore to duplicate should fail");
    if (restore.error !== "TASK_NAME_DUPLICATE") throw new Error(`expected duplicate got ${restore.error}`);
    const r1After = await TaskModel.findOne({ id: "tR1" }).lean() as any;
    if (r1After.status !== "completed") throw new Error("should remain completed");
    ok("10. Restore conflict → fail");
  } catch (e) { fail("10. Restore", e); }

  // 11. Existing duplicate data not auto-deleted: create legacy duplicates directly via Model, then verify new creation still blocked but existing remain
  try {
    await clean();
    await TaskModel.create([
      { id: "dup1", name: "1", deadline: Date.now() + 86400000, status: "pending", createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "synced" } as any,
      { id: "dup2", name: "1", deadline: Date.now() + 86400000, status: "pending", createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "synced" } as any,
    ]);
    const countBefore = await TaskModel.countDocuments({ name: "1", status: { $ne: "completed" } });
    if (countBefore !== 2) throw new Error(`should have 2 dupes got ${countBefore}`);
    const r = await processSyncOperation(createTaskOp("tNew", "1", Date.now() + 86400000) as any);
    if (r.success) throw new Error("new creation should be blocked due to existing dupes");
    const countAfter = await TaskModel.countDocuments({ name: "1", status: { $ne: "completed" } });
    if (countAfter !== 2) throw new Error(`existing dupes should remain 2 got ${countAfter}`);
    ok("11. Existing duplicates preserved, new blocked");
  } catch (e) { fail("11. Existing dupes", e); }

  // 12. No SyncChange for rejected duplicate
  try {
    await clean();
    await processSyncOperation(createTaskOp("t1", "DupTask", Date.now() + 86400000) as any);
    await processSyncOperation(createTaskOp("t2", "DupTask", Date.now() + 86400000) as any);
    const changes = await SyncChangeModel.find({ entity: "task", entityId: "t2" }).lean();
    if (changes.length !== 0) throw new Error("rejected should emit no SyncChange");
    ok("12. Rejected duplicate emits no SyncChange");
  } catch (e) { fail("12. SyncChange", e); }

  await mongoose.disconnect();
  await mongod.stop();
  console.log(`\n=== Task Unique Backend: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
