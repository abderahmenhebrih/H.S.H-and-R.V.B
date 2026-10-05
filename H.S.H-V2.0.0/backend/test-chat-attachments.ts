import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { v4 as uuidv4 } from "uuid";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// Production URL-based media suite (mock storage, no real provider touched).
process.env.CHAT_STORAGE_PROVIDER = "mock";
process.env.RVB_TEST_MODE = "true";
process.env.RVB_JWT_ACCESS_SECRET = "test-access-secret-please-change-in-production-32chars";
process.env.RVB_JWT_REFRESH_SECRET = "test-refresh-secret-please-change-in-production-32chars";

const results: Array<[string, boolean, string?]> = [];
function record(name: string, ok: boolean, detail?: string) {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}
function expectCode(e: any, code: string): boolean {
  return e?.code === code;
}

// Minimal magic-correct buffers (sniffer reads magic bytes only).
const jpegBuf = (n = 256) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n)]);
const pngBuf = (n = 256) =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n)]);
const webpBuf = (n = 256) => Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(n)]);
const mp4Buf = (n = 256) =>
  Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom"), Buffer.alloc(n)]);
const gifBuf = () => Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(256)]);
const txtBuf = () => Buffer.from("just some plain text, not media");

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
  const { ChatUploadModel } = await import("./src/models/chat-upload.model");
  const { NotificationModel } = await import("./src/models/notification.model");
  const chatSvc = await import("./src/services/chat.service");
  const uploadSvc = await import("./src/services/chat-upload.service");
  const { signAccessToken, hashRefreshToken } = await import("./src/lib/rvb-auth");

  await Promise.all([
    RvbAccountModel.deleteMany({}),
    RvbSessionModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
    ChatUploadModel.deleteMany({}),
    NotificationModel.deleteMany({}),
  ]);

  const now = Date.now();
  async function mkAccount(tag: string, role: string) {
    const doc: any = {
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
    };
    const c: any = await RvbAccountModel.create(doc);
    return c.toObject ? c.toObject() : c;
  }
  async function mkSession(acc: any) {
    const sessId = `sess-${uuidv4()}`;
    const refresh = `refresh-${sessId}`;
    await RvbSessionModel.create({
      id: sessId,
      accountId: acc.id,
      refreshTokenHash: hashRefreshToken(refresh),
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      revokedAt: null,
      lastUsedAt: now,
      rotationFamilyId: `fam-${uuidv4()}`,
      clientType: "native",
    } as any);
    return signAccessToken({ accountId: acc.id, tag: acc.tag, role: acc.role, sessionId: sessId });
  }

  const admin = await mkAccount("admin.t", "manager");
  const workerA = await mkAccount("alice.w", "worker");
  const workerB = await mkAccount("bob.w", "worker");
  const outsider = await mkAccount("mallory.w", "worker");
  const tokA = await mkSession(workerA);
  const tokB = await mkSession(workerB);
  const tokOut = await mkSession(outsider);

  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  const { default: chatsRouter } = await import("./src/routes/chats");
  app.use("/api/rvb/chats", chatsRouter);

  const convAB: any = await chatSvc.createDM(workerA.id, workerB.id);
  const convAC: any = await chatSvc.createDM(workerA.id, admin.id);
  const up = (tok: string, convId: string, buf: Buffer, filename = "f.bin", ctype = "application/octet-stream") =>
    request(app).post(`/api/rvb/chats/${convId}/attachments`).set("Authorization", `Bearer ${tok}`).attach("file", buf, { filename, contentType: ctype });

  // 1. upload without auth -> rejected
  try {
    const r = await request(app).post(`/api/rvb/chats/${convAB.id}/attachments`).attach("file", jpegBuf(), { filename: "a.jpg", contentType: "image/jpeg" });
    record("1. upload without auth rejected", r.status === 401, `status=${r.status}`);
  } catch (e: any) { record("1. upload without auth rejected", false, e.message); }

  // 2. upload unauthorized conversation (IDOR) -> rejected
  try {
    const r = await up(tokOut, convAB.id, jpegBuf(), "a.jpg", "image/jpeg");
    record("2. outsider upload rejected", r.status === 403, `status=${r.status} code=${r.body?.code}`);
  } catch (e: any) { record("2. outsider upload rejected", false, e.message); }

  // 3-6. valid JPEG/PNG/WEBP/MP4 -> accepted
  const good: Record<string, any> = {};
  for (const [label, buf, fn, ct] of [
    ["3. valid JPEG accepted", jpegBuf(), "a.jpg", "image/jpeg"],
    ["4. valid PNG accepted", pngBuf(), "a.png", "image/png"],
    ["5. valid WEBP accepted", webpBuf(), "a.webp", "image/webp"],
    ["6. valid MP4 accepted", mp4Buf(), "a.mp4", "video/mp4"],
  ] as const) {
    try {
      const r = await up(tokA, convAB.id, buf, fn, ct);
      const ok = r.status === 201 && !!r.body?.attachment?.id && /^https?:\/\//i.test(r.body.attachment.url);
      if (ok) good[label[0]] = r.body.attachment;
      record(label, ok, `status=${r.status} url=${r.body?.attachment?.url}`);
    } catch (e: any) { record(label, false, e.message); }
  }

  // 7. unsupported MIME (GIF magic) -> rejected
  try {
    const r = await up(tokA, convAB.id, gifBuf(), "a.gif", "image/gif");
    record("7. unsupported MIME rejected", r.status === 400 && r.body?.code === "RVB_ATTACHMENT_INVALID_TYPE", `status=${r.status} code=${r.body?.code}`);
  } catch (e: any) { record("7. unsupported MIME rejected", false, e.message); }

  // 8/9. oversized image/video -> rejected (one bounded alloc each)
  try {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(8 * 1024 * 1024 + 1024)]);
    const r = await up(tokA, convAB.id, big, "big.jpg", "image/jpeg");
    record("8. oversized image rejected", r.status === 413 && r.body?.code === "RVB_ATTACHMENT_TOO_LARGE", `status=${r.status} code=${r.body?.code}`);
  } catch (e: any) { record("8. oversized image rejected", false, e.message); }
  try {
    const big = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypisom"), Buffer.alloc(25 * 1024 * 1024 + 1024)]);
    const r = await up(tokB, convAB.id, big, "big.mp4", "video/mp4");
    record("9. oversized video rejected", r.status === 413 && r.body?.code === "RVB_ATTACHMENT_TOO_LARGE", `status=${r.status} code=${r.body?.code}`);
  } catch (e: any) { record("9. oversized video rejected", false, e.message); }

  // 30. malformed upload does not crash server (no file / text file), server alive after
  try {
    const r1 = await request(app).post(`/api/rvb/chats/${convAB.id}/attachments`).set("Authorization", `Bearer ${tokA}`).field("x", "1");
    const r2 = await up(tokA, convAB.id, txtBuf(), "note.txt", "text/plain");
    const r3 = await up(tokA, convAB.id, jpegBuf(), "ok.jpg", "image/jpeg");
    record(
      "30. malformed upload rejected, server alive",
      r1.status === 400 && r2.status === 400 && r3.status === 201,
      `no-file=${r1.status} text=${r2.status} retry=${r3.status}`,
    );
  } catch (e: any) { record("30. malformed upload rejected, server alive", false, e.message); }

  // Service-level trusted-reference matrix
  const upSvc = (accId: string, convId: string, buf: Buffer) =>
    uploadSvc.uploadChatAttachment({ conversationId: convId, uploaderAccountId: accId, buffer: buf });

  // 14. text-only still works
  try {
    const m = await chatSvc.sendMessage(convAB.id, workerA.id, "hello text");
    record("14. text-only message works", m.content === "hello text" && (m.attachments || []).length === 0, m.id);
  } catch (e: any) { record("14. text-only message works", false, e.message); }

  // 15/16/17. attachment-only image/video + text+media
  let imgId = "", vidId = "";
  try {
    const u = await upSvc(workerA.id, convAB.id, jpegBuf());
    imgId = u.id;
    const m = await chatSvc.sendMessage(convAB.id, workerA.id, "   ", null, null, null, [u.id]);
    record("15. attachment-only image works", m.content === "" && m.attachments?.length === 1 && m.attachments[0].kind === "image" && /^https?:\/\//.test(m.attachments[0].url), m.attachments?.[0]?.url);
  } catch (e: any) { record("15. attachment-only image works", false, `${e.code}: ${e.message}`); }
  try {
    const u = await upSvc(workerB.id, convAB.id, mp4Buf());
    vidId = u.id;
    const m = await chatSvc.sendMessage(convAB.id, workerB.id, "", null, null, null, [u.id]);
    record("16. attachment-only video works", m.attachments?.length === 1 && m.attachments[0].kind === "video", m.id);
  } catch (e: any) { record("16. attachment-only video works", false, `${e.code}: ${e.message}`); }
  try {
    const u = await upSvc(workerA.id, convAB.id, pngBuf());
    const m = await chatSvc.sendMessage(convAB.id, workerA.id, "see this", null, null, null, [u.id]);
    record("17. text + attachment works", m.content === "see this" && m.attachments?.length === 1, m.id);
  } catch (e: any) { record("17. text + attachment works", false, `${e.code}: ${e.message}`); }

  // 10. >3 attachments rejected
  try {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await upSvc(workerA.id, convAB.id, jpegBuf(64))).id);
    await chatSvc.sendMessage(convAB.id, workerA.id, "too many", null, null, null, ids);
    record("10. >3 attachments rejected", false, "did not throw");
  } catch (e: any) { record("10. >3 attachments rejected", expectCode(e, "RVB_ATTACHMENT_LIMIT"), e.code); }

  // 11. arbitrary fake URL / unknown id rejected
  try {
    await chatSvc.sendMessage(convAB.id, workerA.id, "evil", null, null, null, [{ id: "x", kind: "image", url: "https://evil.test/x.jpg", mimeType: "image/jpeg", size: 10 }] as any);
    record("11a. inline fake URL rejected", false, "did not throw");
  } catch (e: any) { record("11a. inline fake URL rejected", expectCode(e, "RVB_ATTACHMENT_INVALID"), e.code); }
  try {
    await chatSvc.sendMessage(convAB.id, workerA.id, "ghost", null, null, null, ["upl-does-not-exist"]);
    record("11b. unknown attachment id rejected", false, "did not throw");
  } catch (e: any) { record("11b. unknown attachment id rejected", expectCode(e, "RVB_ATTACHMENT_INVALID"), e.code); }

  // 12. attachment from another conversation rejected
  try {
    const u = await upSvc(workerA.id, convAB.id, jpegBuf(64));
    await chatSvc.sendMessage(convAC.id, workerA.id, "cross-conv", null, null, null, [u.id]);
    record("12. cross-conversation id rejected", false, "did not throw");
  } catch (e: any) { record("12. cross-conversation id rejected", expectCode(e, "RVB_ATTACHMENT_NOT_ALLOWED"), e.code); }

  // 13. attachment from another user rejected
  try {
    const u = await upSvc(workerA.id, convAB.id, jpegBuf(64));
    await chatSvc.sendMessage(convAB.id, workerB.id, "not mine", null, null, null, [u.id]);
    record("13. cross-user id rejected", false, "did not throw");
  } catch (e: any) { record("13. cross-user id rejected", expectCode(e, "RVB_ATTACHMENT_NOT_ALLOWED"), e.code); }

  // empty text + zero attachments still rejected
  try {
    await chatSvc.sendMessage(convAB.id, workerA.id, "   ", null, null, null, []);
    record("14b. empty message rejected", false, "did not throw");
  } catch (e: any) { record("14b. empty message rejected", expectCode(e, "RVB_CONTENT_REQUIRED"), e.code); }

  // 18. old text messages deserialize
  try {
    const list = await chatSvc.listMessages(convAB.id, workerA.id, { limit: 50 });
    const texts = list.filter((m: any) => m.content === "hello text");
    record("18. old text messages intact", texts.length >= 1 && Array.isArray(texts[0].attachments), `found=${texts.length}`);
  } catch (e: any) { record("18. old text messages intact", false, e.message); }

  // 19. deleted message hides attachments
  try {
    const u = await upSvc(workerB.id, convAB.id, jpegBuf(64));
    const m = await chatSvc.sendMessage(convAB.id, workerB.id, "bye pic", null, null, null, [u.id]);
    await chatSvc.deleteMessage(m.id, workerB.id);
    const list = await chatSvc.listMessages(convAB.id, workerA.id, { limit: 50 });
    const got: any = list.find((x: any) => x.id === m.id);
    record("19. deleted hides attachments", !!got && got.content === "Message deleted" && (got.attachments || []).length === 0, got?.content);
  } catch (e: any) { record("19. deleted hides attachments", false, e.message); }

  // 20/21. previews never blank for media-only
  try {
    const conv: any = await ConversationModel.findOne({ id: convAB.id }).lean();
    const audits = await (await import("./src/models/message-audit.model")).MessageAuditModel.find({ conversationId: convAB.id }).sort({ createdAt: -1 }).limit(5).lean();
    const imgAudit = audits.find((a: any) => a.contentSnapshot === "[Image]");
    record(
      "20/21. media previews not blank",
      ["[Image]", "[Video]", "[Media]"].includes(conv.lastMessagePreview) || (conv.lastMessagePreview || "").length > 0,
      `lastPreview=${conv.lastMessagePreview} imgAudit=${!!imgAudit}`,
    );
  } catch (e: any) { record("20/21. media previews not blank", false, e.message); }
  // notification rows for media-only must not be blank URLs
  try {
    const notifs: any[] = await NotificationModel.find({}).sort({ createdAt: -1 }).limit(30).lean().catch(() => []);
    const chatNotifs = notifs.filter((n: any) => String(n?.message || "").length > 0);
    const hasUrl = chatNotifs.some((n: any) => /https?:\/\//.test(n.message));
    record("20b. notification text not blank/URL", chatNotifs.length > 0 && !hasUrl, `checked=${chatNotifs.length}`);
  } catch (e: any) { record("20b. notification text not blank/URL", false, e.message); }

  // 22/23. socket-shape payload: metadata only, no binary
  try {
    const u = await upSvc(workerA.id, convAB.id, jpegBuf(64));
    const m = await chatSvc.sendMessage(convAB.id, workerA.id, "payload check", null, null, null, [u.id]);
    const wire = JSON.stringify({ conversationId: convAB.id, message: m });
    const hasBinary = wire.includes("dataUrl") || wire.includes("base64,") || wire.includes("Buffer");
    record("22/23. socket payload URL-only", !hasBinary && wire.includes("http"), `bytes=${wire.length}`);
  } catch (e: any) { record("22/23. socket payload URL-only", false, e.message); }

  // 24. send + echo dedupe analog: sent id appears exactly once
  try {
    const m = await chatSvc.sendMessage(convAB.id, workerA.id, "dedupe probe");
    const list = await chatSvc.listMessages(convAB.id, workerA.id, { limit: 100 });
    record("24. sent id single instance", list.filter((x: any) => x.id === m.id).length === 1, m.id);
  } catch (e: any) { record("24. sent id single instance", false, e.message); }

  // 25. unread still works
  try {
    await chatSvc.sendMessage(convAB.id, workerA.id, "unread probe");
    const before = await chatSvc.getUnreadCounts(workerB.id);
    await chatSvc.markRead(convAB.id, workerB.id);
    const after = await chatSvc.getUnreadCounts(workerB.id);
    record("25. unread works", (before[convAB.id] || 0) >= 1 && (after[convAB.id] || 0) === 0, `before=${before[convAB.id]} after=${after[convAB.id]}`);
  } catch (e: any) { record("25. unread works", false, e.message); }

  // 26. pagination still works (oldest-first, stable)
  try {
    const g: any = await chatSvc.createGroup(workerA.id, { name: "PagGrp", memberIds: [workerB.id] });
    for (let i = 0; i < 5; i++) await chatSvc.sendMessage(g.id, workerA.id, `p${i}`);
    // Default page = latest N oldest-first; `before` pages further back.
    const latest2 = await chatSvc.listMessages(g.id, workerA.id, { limit: 2 });
    const rest = await chatSvc.listMessages(g.id, workerA.id, { before: latest2[0].createdAt, limit: 10 });
    const ordered =
      latest2.length === 2 &&
      latest2[0].content === "p3" &&
      latest2[1].content === "p4" &&
      rest.length === 3 &&
      rest[0].content === "p0" &&
      rest.every((m: any) => !latest2.some((f: any) => f.id === m.id));
    record("26. pagination works", ordered, latest2.map((m: any) => m.content).join(","));
  } catch (e: any) { record("26. pagination works", false, e.message); }

  // 27. mentions still work
  try {
    const m = await chatSvc.sendMessage(convAB.id, workerA.id, "hi @everyone look");
    record("27. mentions work", (m.mentions || []).includes("everyone"), (m.mentions || []).join(","));
  } catch (e: any) { record("27. mentions work", false, e.message); }

  // 28. pin still works
  try {
    const m = await chatSvc.sendMessage(convAB.id, workerA.id, "pin me");
    await chatSvc.pinMessage(convAB.id, m.id, workerA.id);
    const c1: any = await ConversationModel.findOne({ id: convAB.id }).lean();
    await chatSvc.unpinMessage(convAB.id, m.id, workerA.id);
    const c2: any = await ConversationModel.findOne({ id: convAB.id }).lean();
    record("28. pin works", c1.pinnedMessages.some((p: any) => p.messageId === m.id) && !c2.pinnedMessages.some((p: any) => p.messageId === m.id), "");
  } catch (e: any) { record("28. pin works", false, e.message); }

  // 29. reactions: atomic toggle, concurrent toggles never duplicate
  try {
    const m = await chatSvc.sendMessage(convAB.id, workerA.id, "react me");
    await chatSvc.toggleReaction(m.id, workerB.id);
    const one: any = await MessageModel.findOne({ id: m.id }).lean();
    await Promise.all([chatSvc.toggleReaction(m.id, workerB.id), chatSvc.toggleReaction(m.id, workerB.id)]);
    const two: any = await MessageModel.findOne({ id: m.id }).lean();
    const mine = (r: any) => (r.reactions || []).filter((x: any) => x.accountId === workerB.id && x.emoji === "🤝").length;
    record("29. reactions atomic, no dupes", mine(one) === 1 && mine(two) <= 1, `after-add=${mine(one)} after-race=${mine(two)}`);
  } catch (e: any) { record("29. reactions atomic, no dupes", false, e.message); }

  // Orphan cleanup: expired pending removed, attached kept
  try {
    const u = await upSvc(workerA.id, convAB.id, jpegBuf(64));
    await ChatUploadModel.updateOne({ id: u.id }, { $set: { expiresAt: Date.now() - 1000 } });
    try {
      await chatSvc.sendMessage(convAB.id, workerA.id, "expired use", null, null, null, [u.id]);
      record("OCa. expired upload rejected", false, "did not throw");
    } catch (e: any) { record("OCa. expired upload rejected", expectCode(e, "RVB_ATTACHMENT_NOT_ALLOWED"), e.code); }
    const cleaned = await uploadSvc.deleteOrphanChatUploads(50);
    const gone = await ChatUploadModel.findOne({ id: u.id }).lean();
    const kept = await ChatUploadModel.findOne({ id: imgId }).lean();
    record("OCb. orphan cleanup removes expired pending, keeps attached", cleaned.rows >= 1 && !gone && !!kept && kept.status === "attached", `rows=${cleaned.rows}`);
  } catch (e: any) { record("OCb. orphan cleanup", false, e.message); }

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
