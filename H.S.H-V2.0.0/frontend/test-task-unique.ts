import "fake-indexeddb/auto";
import { db } from "./src/lib/database/db";
import { taskService } from "./src/services/task.service";

async function reset() {
  try { await db.delete(); } catch {}
  await db.open();
  for (const tbl of (db as any).tables) {
    try { await (db as any)[tbl.name].clear(); } catch {}
  }
}

let passed = 0, failed = 0;
function ok(n: string) { console.log(`✅ ${n}`); passed++; }
function fail(n: string, e: any) { console.log(`❌ ${n}: ${e?.message || e}`); failed++; }
function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

async function main() {
  console.log("=== Task Unique Name Tests ===");

  // CREATE exact duplicate → fail
  try {
    await reset();
    await taskService.create({ name: "QA Unique Task", deadline: Date.now() + 86400000 });
    let threw = false;
    try { await taskService.create({ name: "QA Unique Task", deadline: Date.now() + 86400000 }); } catch (e: any) { threw = true; assert(e.message.includes("already exists"), "wrong msg: " + e.message); }
    assert(threw, "should throw duplicate");
    const all = await taskService.getAll();
    const pending = all.filter((t: any) => (t.status ?? "pending") !== "completed" && t.name.trim() === "QA Unique Task");
    assert(pending.length === 1, `pending count 1 got ${pending.length}`);
    ok("CREATE exact duplicate → fail");
  } catch (e) { fail("CREATE exact duplicate", e); }

  // CREATE whitespace-equivalent → fail
  try {
    await reset();
    await taskService.create({ name: "QA Unique Task", deadline: Date.now() + 86400000 });
    let threw = false;
    try { await taskService.create({ name: "   QA Unique Task   ", deadline: Date.now() + 86400000 }); } catch (e: any) { threw = true; }
    assert(threw, "whitespace duplicate should fail");
    ok("CREATE whitespace-equivalent → fail");
  } catch (e) { fail("CREATE whitespace", e); }

  // CREATE case variant → success
  try {
    await reset();
    await taskService.create({ name: "QA Unique Task", deadline: Date.now() + 86400000 });
    await taskService.create({ name: "qa unique task", deadline: Date.now() + 86400000 });
    const all = await taskService.getAll();
    assert(all.length === 2, `both case variants allowed, got ${all.length}`);
    ok("CREATE case variant → success");
  } catch (e) { fail("CREATE case variant", e); }

  // UPDATE to duplicate → fail
  try {
    await reset();
    const a = await taskService.create({ name: "QA Unique Task", deadline: Date.now() + 86400000 });
    const b = await taskService.create({ name: "QA Edit Source", deadline: Date.now() + 86400000 });
    let threw = false;
    try { await taskService.update(b.id, { name: "QA Unique Task" }); } catch (e: any) { threw = true; }
    assert(threw, "update to duplicate should fail");
    const bAfter = await taskService.getById(b.id);
    assert(bAfter?.name === "QA Edit Source", `b should remain QA Edit Source, got ${bAfter?.name}`);
    ok("UPDATE to duplicate → fail");
  } catch (e) { fail("UPDATE to duplicate", e); }

  // UPDATE same task unchanged → success
  try {
    await reset();
    const a = await taskService.create({ name: "QA Unique Task", deadline: Date.now() + 86400000 });
    await taskService.update(a.id, { name: "QA Unique Task", deadline: a.deadline + 1000 });
    const after = await taskService.getById(a.id);
    assert(after?.name === "QA Unique Task", "unchanged edit should keep name");
    ok("UPDATE same task unchanged → success");
  } catch (e) { fail("UPDATE unchanged", e); }

  // UPDATE whitespace same task → allow
  try {
    await reset();
    const a = await taskService.create({ name: "QA Unique Task", deadline: Date.now() + 86400000 });
    await taskService.update(a.id, { name: "  QA Unique Task  " });
    const after = await taskService.getById(a.id);
    assert(after?.name === "QA Unique Task", `whitespace self should be allowed and stored trimmed, got ${after?.name}`);
    ok("UPDATE whitespace self → allow");
  } catch (e) { fail("UPDATE whitespace self", e); }

  // Finished name reuse → success
  try {
    await reset();
    const a = await taskService.create({ name: "QA Unique Task", deadline: Date.now() + 86400000 });
    await taskService.complete(a.id);
    const afterComplete = await taskService.getById(a.id);
    assert(afterComplete?.status === "completed", "should be completed");
    await taskService.create({ name: "QA Unique Task", deadline: Date.now() + 86400000 });
    const all = await taskService.getAll();
    const pending = all.filter((t: any) => (t.status ?? "pending") !== "completed" && t.name.trim() === "QA Unique Task");
    const completed = all.filter((t: any) => t.status === "completed" && t.name.trim() === "QA Unique Task");
    assert(pending.length === 1 && completed.length === 1, `should have 1 pending and 1 completed, got pending ${pending.length} completed ${completed.length}`);
    ok("Finished name reuse → success");
  } catch (e) { fail("Finished reuse", e); }

  // Restore conflict → fail if restoration exists (reschedule)
  try {
    await reset();
    const finished = await taskService.create({ name: "QA Restore", deadline: Date.now() + 86400000 });
    await taskService.complete(finished.id);
    await taskService.create({ name: "QA Restore", deadline: Date.now() + 86400000 });
    // Try to reschedule finished back to pending (should fail)
    let threw = false;
    try { await taskService.reschedule(finished.id, Date.now() + 2 * 86400000); } catch (e: any) { threw = true; assert(e.message.includes("already exists"), "wrong msg " + e.message); }
    assert(threw, "restore/reschedule to duplicate should fail");
    const finAfter = await taskService.getById(finished.id);
    assert(finAfter?.status === "completed", "finished should remain completed after blocked restore");
    ok("Restore conflict → fail");
  } catch (e) { fail("Restore conflict", e); }

  // Existing duplicate data handling: create two with different names, then manually create duplicate via direct repo to simulate legacy duplicate, ensure new creation still blocked but existing remain
  try {
    await reset();
    const { taskRepository } = await import("./src/repositories/task.repository");
    // Directly create two unfinished with same name via repository (bypassing service) to simulate existing duplicate
    await taskRepository.create({ id: "dup1", name: "1", deadline: Date.now() + 86400000, status: "pending", createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "pending" } as any);
    await taskRepository.create({ id: "dup2", name: "1", deadline: Date.now() + 86400000, status: "pending", createdAt: Date.now(), updatedAt: Date.now(), syncStatus: "pending" } as any);
    const allBefore = await taskService.getAll();
    assert(allBefore.length === 2, "should have 2 existing duplicates");
    // Now try to create new via service -> should fail, but existing remain
    let threw = false;
    try { await taskService.create({ name: "1", deadline: Date.now() + 86400000 }); } catch { threw = true; }
    assert(threw, "new creation should be blocked due to existing duplicates");
    const allAfter = await taskService.getAll();
    assert(allAfter.length === 2, `existing duplicates should remain 2, got ${allAfter.length}`);
    console.log("  Existing duplicates handled: no auto-delete, new creation blocked");
    ok("Existing duplicate data handling");
  } catch (e) { fail("Existing duplicate", e); }

  console.log(`\n=== Task Unique: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
