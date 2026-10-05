import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

process.env.RVB_TEST_MODE = "true";
process.env.RVB_JWT_ACCESS_SECRET = "test-access-secret-please-change-in-production-32chars";
process.env.RVB_JWT_REFRESH_SECRET = "test-refresh-secret-please-change-in-production-32chars";

const results: Array<[string, boolean, string?]> = [];
function record(name: string, ok: boolean, detail?: string) {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run() {
  let mongod: any = null;
  try {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  } catch (e) {
    console.error("Memory server failed", e);
    process.exit(1);
  }

  const { RvbAccountModel } = await import("./src/models/rvb-account.model");
  const { RvbSessionModel } = await import("./src/models/rvb-session.model");
  const { ConversationModel } = await import("./src/models/conversation.model");
  const { MessageModel } = await import("./src/models/message.model");
  const chatSvc = await import("./src/services/chat.service");
  const { signAccessToken, hashRefreshToken } = await import("./src/lib/rvb-auth");

  await Promise.all([
    RvbAccountModel.deleteMany({}),
    RvbSessionModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
  ]);

  const now = Date.now();
  async function mkAccount(tag: string, role: string) {
    const c: any = await RvbAccountModel.create({
      id: `acc-${uuidv4()}`,
      createdAt: now,
      updatedAt: now,
      tag,
      displayName: tag,
      role,
      linkedEntityType: null,
      linkedEntityId: null,
      status: "active",
      onboardingStatus: "complete",
    } as any);
    return c.toObject ? c.toObject() : c;
  }
  async function mkSession(acc: any) {
    const sessId = `sess-${uuidv4()}`;
    await RvbSessionModel.create({
      id: sessId,
      accountId: acc.id,
      refreshTokenHash: hashRefreshToken(`refresh-${sessId}`),
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      revokedAt: null,
      lastUsedAt: now,
      rotationFamilyId: `fam-${uuidv4()}`,
      clientType: "native",
    } as any);
    return signAccessToken({ accountId: acc.id, tag: acc.tag, role: acc.role, sessionId: sessId });
  }

  const workerA = await mkAccount("alice.w", "worker");
  const workerB = await mkAccount("bob.w", "worker");
  const outsider = await mkAccount("mallory.w", "worker");
  const tokA = await mkSession(workerA);
  const tokOut = await mkSession(outsider);

  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  const { default: chatsRouter } = await import("./src/routes/chats");
  app.use("/api/rvb/chats", chatsRouter);

  const convAB: any = await chatSvc.createDM(workerA.id, workerB.id);
  const react = (tok: string, mid: string, body?: any) =>
    request(app).post(`/api/rvb/chats/messages/${mid}/reaction`).set("Authorization", `Bearer ${tok}`).send(body || {});
  const mine = async (mid: string, accId: string) => {
    const m: any = await MessageModel.findOne({ id: mid }).lean();
    return (m.reactions || []).filter((r: any) => r.accountId === accId);
  };

  const base = await chatSvc.sendMessage(convAB.id, workerA.id, "react target");

  // 1. add ❤️
  try {
    await chatSvc.setReaction(base.id, workerA.id, "❤️");
    const got = await mine(base.id, workerA.id);
    record("1. add ❤️", got.length === 1 && got[0].emoji === "❤️", JSON.stringify(got[0]));
  } catch (e: any) { record("1. add ❤️", false, `${e.code}: ${e.message}`); }

  // 2. tap again removes
  try {
    await chatSvc.setReaction(base.id, workerA.id, "❤️");
    const got = await mine(base.id, workerA.id);
    record("2. re-tap removes", got.length === 0, `left=${got.length}`);
  } catch (e: any) { record("2. re-tap removes", false, `${e.code}: ${e.message}`); }

  // 3. ❤️ -> 😂 replaces own reaction
  try {
    await chatSvc.setReaction(base.id, workerA.id, "❤️");
    await chatSvc.setReaction(base.id, workerA.id, "😂");
    const got = await mine(base.id, workerA.id);
    record("3. change replaces", got.length === 1 && got[0].emoji === "😂", JSON.stringify(got));
  } catch (e: any) { record("3. change replaces", false, `${e.code}: ${e.message}`); }

  // 4. two users, different emojis
  try {
    await chatSvc.setReaction(base.id, workerB.id, "😮");
    const m: any = await MessageModel.findOne({ id: base.id }).lean();
    const emojis = new Set((m.reactions || []).map((r: any) => `${r.accountId}:${r.emoji}`));
    record("4. two users differ", emojis.has(`${workerA.id}:😂`) && emojis.has(`${workerB.id}:😮`), [...emojis].join(","));
  } catch (e: any) { record("4. two users differ", false, `${e.code}: ${e.message}`); }

  // 5. two users, same emoji => count 2
  try {
    const m2 = await chatSvc.sendMessage(convAB.id, workerA.id, "same emoji");
    await chatSvc.setReaction(m2.id, workerA.id, "👍");
    await chatSvc.setReaction(m2.id, workerB.id, "👍");
    const m: any = await MessageModel.findOne({ id: m2.id }).lean();
    const thumbs = (m.reactions || []).filter((r: any) => r.emoji === "👍");
    record("5. same emoji count 2", thumbs.length === 2, `count=${thumbs.length}`);
  } catch (e: any) { record("5. same emoji count 2", false, `${e.code}: ${e.message}`); }

  // 6. outsider rejected (service)
  try {
    await chatSvc.setReaction(base.id, outsider.id, "❤️");
    record("6. outsider rejected", false, "did not throw");
  } catch (e: any) { record("6. outsider rejected", e.code === "RVB_FORBIDDEN", e.code); }

  // 7. HTTP: outsider 403, anonymous 401
  try {
    const r1 = await react(tokOut, base.id, { emoji: "❤️" });
    const r2 = await request(app).post(`/api/rvb/chats/messages/${base.id}/reaction`).send({ emoji: "❤️" });
    record("7. HTTP authz", r1.status === 403 && r2.status === 401, `outsider=${r1.status} anon=${r2.status}`);
  } catch (e: any) { record("7. HTTP authz", false, e.message); }

  // 8/9. invalid + huge rejected
  try {
    const bad = ["hello", "", "a", "5", "<b>", "❤️😂", "   ", "x".repeat(200)];
    const codes: string[] = [];
    for (const b of bad) {
      try {
        await chatSvc.setReaction(base.id, workerA.id, b);
        codes.push(`ACCEPTED:${b.slice(0, 8)}`);
      } catch (e: any) {
        codes.push(e.code);
      }
    }
    const allInvalid = codes.every((c) => c === "RVB_REACTION_INVALID");
    record("8/9. invalid+huge rejected", allInvalid, codes.join(","));
  } catch (e: any) { record("8/9. invalid+huge rejected", false, e.message); }

  // 10. concurrent same-emoji toggles never duplicate; concurrent change converges to 1
  try {
    const m3 = await chatSvc.sendMessage(convAB.id, workerA.id, "race");
    await Promise.all([chatSvc.setReaction(m3.id, workerA.id, "🔥"), chatSvc.setReaction(m3.id, workerA.id, "🔥")]);
    const afterSame = await mine(m3.id, workerA.id);
    await Promise.all([chatSvc.setReaction(m3.id, workerA.id, "⭐"), chatSvc.setReaction(m3.id, workerB.id, "⭐")]);
    const m: any = await MessageModel.findOne({ id: m3.id }).lean();
    const aCount = (m.reactions || []).filter((r: any) => r.accountId === workerA.id).length;
    record("10. concurrent no dupes", afterSame.length <= 1 && aCount === 1, `same-race=${afterSame.length} change=${aCount}`);
  } catch (e: any) { record("10. concurrent no dupes", false, `${e.code}: ${e.message}`); }

  // 11. legacy 🤝 toggle still works + renders (shape check)
  try {
    const m4 = await chatSvc.sendMessage(convAB.id, workerA.id, "legacy");
    const added: any = await chatSvc.toggleReaction(m4.id, workerB.id);
    const has = (added.reactions || []).some((r: any) => r.accountId === workerB.id && r.emoji === "🤝" && typeof r.createdAt === "number");
    const removed: any = await chatSvc.toggleReaction(m4.id, workerB.id);
    const gone = !(removed.reactions || []).some((r: any) => r.accountId === workerB.id);
    record("11. legacy 🤝 renders", has && gone, `add=${has} remove=${gone}`);
  } catch (e: any) { record("11. legacy 🤝 renders", false, `${e.code}: ${e.message}`); }

  // 12. HTTP route: explicit emoji + legacy empty body
  try {
    const m5 = await chatSvc.sendMessage(convAB.id, workerA.id, "http route");
    const r1 = await react(tokA, m5.id, { emoji: "😮" });
    const okExplicit = r1.status === 200 && (r1.body?.message?.reactions || []).some((r: any) => r.accountId === workerA.id && r.emoji === "😮");
    const r2 = await react(tokA, m5.id, {});
    const okLegacy = r2.status === 200 && (r2.body?.message?.reactions || []).some((r: any) => r.accountId === workerA.id && r.emoji === "🤝");
    const r3 = await react(tokA, m5.id, { emoji: "not-an-emoji-at-all" });
    record("12. socket-payload route", okExplicit && okLegacy && r3.status === 400, `explicit=${r1.status} legacy=${r2.status} bad=${r3.status}`);
  } catch (e: any) { record("12. socket-payload route", false, e.message); }

  // 13. quick-send server equivalent: 🤝 content is a normal message
  try {
    const q = await chatSvc.sendMessage(convAB.id, workerB.id, "🤝");
    record("13. quick 🤝 is normal message", q.content === "🤝" && (q.reactions || []).length === 0, q.id);
  } catch (e: any) { record("13. quick 🤝 is normal message", false, `${e.code}: ${e.message}`); }

  // 14. one-per-user chain converges to the latest single emoji
  try {
    const m6 = await chatSvc.sendMessage(convAB.id, workerA.id, "chain");
    await chatSvc.setReaction(m6.id, workerA.id, "❤️");
    await chatSvc.setReaction(m6.id, workerA.id, "😂");
    await chatSvc.setReaction(m6.id, workerA.id, "😮");
    const got = await mine(m6.id, workerA.id);
    record("14. chain converges single", got.length === 1 && got[0].emoji === "😮", JSON.stringify(got));
  } catch (e: any) { record("14. chain converges single", false, `${e.code}: ${e.message}`); }

  const passed = results.filter(([, ok]) => ok).length;
  console.log(`\n=== RESULTS: ${passed}/${results.length} passed ===`);
  for (const [n, ok, d] of results) if (!ok) console.log(`  FAILED: ${n} — ${d}`);

  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  process.exit(passed === results.length ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
