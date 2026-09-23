import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyAccessToken } from "./rvb-auth";
import { RvbAccountModel } from "../models/rvb-account.model";
import { RvbSessionModel } from "../models/rvb-session.model";
import { ConversationModel } from "../models/conversation.model";

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer | null {
  return io;
}

export function disconnectRvbSession(sessionId: string) {
  if (!io || !sessionId) return;
  try {
    // Prefer room-based disconnect if sockets joined session:${sessionId}
    try {
      const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
      if (room && room.size > 0) {
        io.in(`session:${sessionId}`).disconnectSockets(true);
        return;
      }
    } catch {}
    for (const sock of (io.sockets.sockets as any).values()) {
      const u = (sock as any).data?.rvbUser;
      if (u?.sessionId === sessionId) {
        try { sock.disconnect(true); } catch {}
      }
    }
  } catch {}
}

export function disconnectRvbAccount(accountId: string) {
  if (!io || !accountId) return;
  try {
    try {
      const room = io.sockets.adapter.rooms.get(`user:${accountId}`);
      if (room && room.size > 0) {
        io.in(`user:${accountId}`).disconnectSockets(true);
        return;
      }
    } catch {}
    for (const sock of (io.sockets.sockets as any).values()) {
      const u = (sock as any).data?.rvbUser;
      if (u?.accountId === accountId) {
        try { sock.disconnect(true); } catch {}
      }
    }
  } catch {}
}

export function disconnectRvbAccountExcept(accountId: string, exceptSessionId: string | null) {
  if (!io || !accountId) return;
  try {
    for (const sock of (io.sockets.sockets as any).values()) {
      const u = (sock as any).data?.rvbUser;
      if (u?.accountId === accountId && u?.sessionId !== exceptSessionId) {
        try { sock.disconnect(true); } catch {}
      }
    }
  } catch {}
}

export function initChatSocket(httpServer: HttpServer, allowedOrigins: string[]) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
        else cb(new Error("CORS blocked"), false as any);
      },
      credentials: true,
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization", "X-RVB-Client", "X-Refresh-Token"],
    },
    path: "/api/rvb/chats/socket",
  });

  io.use(async (socket: any, next) => {
    try {
      const rawAuth = (socket.handshake.auth?.token as string) || (socket.handshake.headers?.authorization as string);
      const token = rawAuth ? rawAuth.replace(/^Bearer\s+/i, "").trim() : null;
      if (!token) return next(new Error("RVB_UNAUTHENTICATED"));
      let payload: any;
      try {
        payload = verifyAccessToken(token);
      } catch {
        return next(new Error("RVB_TOKEN_INVALID"));
      }
      const accountId = payload.accountId || payload.id;
      const account: any = await RvbAccountModel.findOne({ id: accountId }).lean();
      if (!account) return next(new Error("RVB_UNAUTHENTICATED"));
      if (account.status !== "active") return next(new Error(account.status === "archived" ? "RVB_ACCOUNT_ARCHIVED" : "RVB_ACCOUNT_DISABLED"));
      // Immediate session revocation check for socket handshake
      const sessionId = payload.sessionId as string | undefined;
      if (!sessionId) return next(new Error("RVB_SESSION_REVOKED"));
      const session: any = await RvbSessionModel.findOne({ id: sessionId, accountId, revokedAt: null, expiresAt: { $gt: Date.now() } }).lean();
      if (!session) return next(new Error("RVB_SESSION_REVOKED"));
      socket.data.rvbUser = {
        accountId: account.id,
        tag: account.tag,
        role: account.role,
        status: account.status,
        sessionId: payload.sessionId,
        account,
      };
      next();
    } catch (e) {
      next(e as any);
    }
  });

  io.on("connection", async (socket: any) => {
    const user = socket.data.rvbUser;
    if (!user) {
      socket.disconnect();
      return;
    }
    // Join user/session/role rooms for targeted disconnect + realtime
    socket.join(`user:${user.accountId}`);
    socket.join(`session:${user.sessionId}`);
    if (user.role) socket.join(`role:${user.role}`);

    // Auto-join all conversations user is participant of
    try {
      const convs = await ConversationModel.find({ "participants.accountId": user.accountId }).lean();
      for (const c of convs as any[]) {
        const p = (c.participants as any[]).find((x: any) => x.accountId === user.accountId && !x.leftAt);
        if (p) socket.join(c.id);
      }
    } catch {}

    socket.on("chat:join", async ({ conversationId }: any, cb: any) => {
      try {
        const conv: any = await ConversationModel.findOne({ id: conversationId }).lean();
        if (!conv) return cb?.({ success: false, code: "RVB_CONVERSATION_NOT_FOUND" });
        const isMember = (conv.participants as any[]).some((p: any) => p.accountId === user.accountId && !p.leftAt);
        if (!isMember) return cb?.({ success: false, code: "RVB_FORBIDDEN" });
        socket.join(conversationId);
        cb?.({ success: true });
      } catch (e: any) {
        cb?.({ success: false, code: e?.code || "INTERNAL_ERROR" });
      }
    });

    socket.on("chat:leave", ({ conversationId }: any) => {
      socket.leave(conversationId);
    });

    socket.on("chat:typing", ({ conversationId, isTyping }: any) => {
      // Ephemeral, not persisted
      // Verify membership
      ConversationModel.findOne({ id: conversationId }).lean().then((conv: any) => {
        if (!conv) return;
        const isMember = (conv.participants as any[]).some((p: any) => p.accountId === user.accountId && !p.leftAt);
        if (!isMember) return;
        socket.to(conversationId).emit("chat:typing", { conversationId, accountId: user.accountId, tag: user.tag, isTyping: !!isTyping });
      }).catch(() => {});
    });

    socket.on("disconnect", () => {});
  });

  return io;
}
