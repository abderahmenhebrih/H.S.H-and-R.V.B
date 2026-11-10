import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

// Regression test for the GET /api/rvb/chats double membership-sync fix:
// getUnreadCounts(accountId, conversations?) must return identical counts
// whether it lists conversations itself or reuses a caller-provided list.
async function run() {
  let passed = 0;
  let failed = 0;
  const ok = (n: string) => { console.log(`PASS: ${n}`); passed++; };
  const fail = (n: string, e: any) => { console.log(`FAIL: ${n}: ${e?.message || e}`); failed++; };

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const now = Date.now();
  const { RvbAccountModel } = await import("./src/models/rvb-account.model");
  const { ConversationModel } = await import("./src/models/conversation.model");
  const { MessageModel } = await import("./src/models/message.model");
  const chatSvc = await import("./src/services/chat.service");
  await Promise.all([
    RvbAccountModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
  ]);

  const mgr = await RvbAccountModel.create({ id: `m-${now}`, createdAt: now, updatedAt: now, tag: "mgr.u", displayName: "Mgr", role: "manager", linkedEntityType: null, linkedEntityId: null, status: "active", onboardingStatus: "complete" } as any);
  const w1 = await RvbAccountModel.create({ id: `w1-${now}`, createdAt: now, updatedAt: now, tag: "w.one", displayName: "W One", role: "worker", linkedEntityType: null, linkedEntityId: null, status: "active", onboardingStatus: "complete" } as any);
  const w2 = await RvbAccountModel.create({ id: `w2-${now}`, createdAt: now, updatedAt: now, tag: "w.two", displayName: "W Two", role: "worker", linkedEntityType: null, linkedEntityId: null, status: "active", onboardingStatus: "complete" } as any);

  try {
    const g = await chatSvc.createGroup((w1 as any).id, { name: "Reuse Group", memberIds: [(w2 as any).id, (mgr as any).id] });
    await chatSvc.sendMessage(g.id, (w1 as any).id, "hello manager");

    const listed = await chatSvc.listConversationsForUser((mgr as any).id);
    const fromScratch = await chatSvc.getUnreadCounts((mgr as any).id);
    const reused = await chatSvc.getUnreadCounts((mgr as any).id, listed as any);
    const a = JSON.stringify(fromScratch);
    const b = JSON.stringify(reused);
    if (a === b) ok(`reused list matches fresh list (${a})`);
    else fail("reused list matches fresh list", `${a} !== ${b}`);

    const total = Object.values(fromScratch as any).reduce((s: number, v: any) => s + v, 0);
    if (total >= 1) ok(`unread counted (${total})`);
    else fail("unread counted", JSON.stringify(fromScratch));
  } catch (e) {
    fail("unread reuse", e);
  }

  console.log(`\n=== unread-reuse: ${passed} passed, ${failed} failed ===`);
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(failed ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
