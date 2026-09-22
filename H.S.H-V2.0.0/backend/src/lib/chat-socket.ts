import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyAccessToken } from "./rvb-auth";
import { RvbAccountModel } from "../models/rvb-account.model";
import { ConversationModel } from "../models/conversation.model";

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer | null {
  return io;
}

export function initChatSocket(httpServer: HttpServer, allowedOrigins: string[]) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
        else cb(new Error("CORS blocked"), false as any);
      },
      credentials: true,
    },
    path: "/api/rvb/chats/socket",
  });

  io.use(async (socket: any, next) => {
    try {
      const token = (socket.handshake.auth?.token as string) || (socket.handshake.headers?.authorization as string)?.replace("Bearer ", "") || (socket.handshake.query?.token as string);
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
    // Join user room for unread updates + role room for broadcast notifications
    socket.join(`user:${user.accountId}`);
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
