import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { v4 as uuidv4 } from "uuid";
import { createServer } from "http";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { io as clientIO } from "socket.io-client";

process.env.RVB_TEST_MODE = "true";
process.env.RVB_JWT_ACCESS_SECRET = "test-access-secret-please-change-in-production-32chars";
process.env.RVB_JWT_REFRESH_SECRET = "test-refresh-secret-please-change-in-production-32chars";

const results: Array<[string, boolean, string?]> = [];
function record(name: string, ok: boolean, detail?: string) {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
}

const PATH = "/api/rvb/chats/socket";
const TIMEOUT = 8000;

function waitFor(sock: any, event: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), TIMEOUT);
    sock.once(event, (...args: any[]) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
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
  const chatSvc = await import("./src/services/chat.service");
  const { signAccessToken, hashRefreshToken } = await import("./src/lib/rvb-auth");
  const { initChatSocket } = await import("./src/lib/chat-socket");

  await Promise.all([
    RvbAccountModel.deleteMany({}),
    RvbSessionModel.deleteMany({}),
    ConversationModel.deleteMany({}),
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
    return { sessId, access: signAccessToken({ accountId: acc.id, tag: acc.tag, role: acc.role, sessionId: sessId }) };
  }

  const workerA = await mkAccount("alice.w", "worker");
  const workerB = await mkAccount("bob.w", "worker");
  const outsider = await mkAccount("mallory.w", "worker");
  const sessA = await mkSession(workerA);
  const sessB = await mkSession(workerB);
  const sessOut = await mkSession(outsider);

  // Same shape as production server.ts: express owns the server, the
  // Socket.IO layer attaches and intercepts only its own path.
  const app = express();
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  const { default: chatsRouter } = await import("./src/routes/chats");
  app.use("/api/rvb/chats", chatsRouter);
  const httpServer: any = createServer(app);
  initChatSocket(httpServer, ["http://localhost:3000"]);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = httpServer.address().port;
  const url = `http://127.0.0.1:${port}`;
  const clients: any[] = [];
  const mkClient = (token: string | null, transports?: string[]) => {
    const s: any = clientIO(url, {
      path: PATH,
      auth: token ? { token } : {},
      transports: transports || ["polling", "websocket"],
      reconnection: false,
      timeout: TIMEOUT,
    });
    clients.push(s);
    return s;
  };

  const convAB: any = await chatSvc.createDM(workerA.id, workerB.id);

  // 1. valid token connects (default negotiated transports)
  try {
    const s = mkClient(sessA.access);
    await waitFor(s, "connect");
    record("1. valid token connects", s.connected === true, `id=${s.id}`);
  } catch (e: any) { record("1. valid token connects", false, e.message); }

  // 2. polling-only transport connects (fallback compatibility)
  try {
    const s = mkClient(sessB.access, ["polling"]);
    await waitFor(s, "connect");
    record("2. polling-only connects", s.connected === true, `transport=${s.io?.engine?.transport?.name}`);
  } catch (e: any) { record("2. polling-only connects", false, e.message); }

  // 3. bad token rejected with auth code (NOT a transport error)
  try {
    const s = mkClient("garbage.token.here");
    const [err] = await waitFor(s, "connect_error");
    const msg = String((err as any)?.message || "");
    record("3. bad token auth rejection", /RVB_TOKEN_INVALID|RVB_UNAUTHENTICATED/.test(msg) && msg !== "websocket error", msg);
  } catch (e: any) { record("3. bad token auth rejection", false, e.message); }

  // 4. revoked session rejected distinctly
  try {
    await RvbSessionModel.updateOne({ id: sessOut.sessId }, { $set: { revokedAt: Date.now() } });
    const s = mkClient(sessOut.access);
    const [err] = await waitFor(s, "connect_error");
    const msg = String((err as any)?.message || "");
    record("4. revoked session rejected", msg.includes("RVB_SESSION_REVOKED"), msg);
  } catch (e: any) { record("4. revoked session rejected", false, e.message); }

  // 5/6. chat:join accepted for member, rejected for outsider (fresh session)
  let sockA: any = null;
  let sockB: any = null;
  try {
    sockA = mkClient(sessA.access);
    sockB = mkClient(sessB.access);
    await Promise.all([waitFor(sockA, "connect"), waitFor(sockB, "connect")]);
    const ackA: any = await new Promise((resolve) => sockA.emit("chat:join", { conversationId: convAB.id }, resolve));
    const outsider2 = await mkAccount("mallory2.w", "worker");
    const sessOut2 = await mkSession(outsider2);
    const sockO: any = mkClient(sessOut2.access);
    await waitFor(sockO, "connect");
    const ackO: any = await new Promise((resolve) => sockO.emit("chat:join", { conversationId: convAB.id }, resolve));
    record("5/6. join member ok, outsider rejected", ackA?.success === true && ackO?.success === false, `member=${ackA?.success} outsider=${ackO?.success}:${ackO?.code}`);
  } catch (e: any) { record("5/6. join member ok, outsider rejected", false, e.message); }

  // 7. typing echo routes through the room (B receives A's typing)
  try {
    const seen = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no typing echo")), TIMEOUT);
      sockB.once("chat:typing", (p: any) => {
        clearTimeout(timer);
        resolve(p);
      });
    });
    sockA.emit("chat:typing", { conversationId: convAB.id, isTyping: true });
    const p = await seen;
    record("7. typing room echo", p?.conversationId === convAB.id && p?.accountId === workerA.id, `from=${p?.accountId}`);
  } catch (e: any) { record("7. typing room echo", false, e.message); }

  // 8. live deletion: A deletes via HTTP, B's socket gets the event with the
  // message id, and a reload shows the placeholder (no leak, no dupes).
  try {
    const live: any = await chatSvc.sendMessage(convAB.id, workerA.id, "live delete me");
    const seenDel = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no delete event")), TIMEOUT);
      sockB.once("chat:messageDeleted", (ev: any) => {
        clearTimeout(timer);
        resolve(ev);
      });
    });
    const r = await request(app).delete(`/api/rvb/chats/messages/${live.id}`).set("Authorization", `Bearer ${sessA.access}`);
    const ev = await seenDel;
    const listB = await chatSvc.listMessages(convAB.id, workerB.id, { limit: 50 });
    const matches = listB.filter((x: any) => x.id === live.id);
    const got: any = matches[0];
    record(
      "8. live delete converges",
      r.status === 200 && ev?.messageId === live.id && ev?.conversationId === convAB.id &&
        matches.length === 1 && got?.content === "Message deleted" && (got?.attachments || []).length === 0,
      `http=${r.status} ev=${ev?.messageId} copies=${matches.length}`,
    );
  } catch (e: any) { record("8. live delete converges", false, e.message); }

  for (const c of clients) {
    try { c.disconnect(); } catch {}
  }
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));

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
