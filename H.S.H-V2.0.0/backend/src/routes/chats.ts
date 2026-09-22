import { Router } from "express";
import { requireRvbAuth } from "../middleware/rvb-auth";
import type { RvbAuthRequest } from "../middleware/rvb-auth";
import * as chatSvc from "../services/chat.service";
import { RvbAccountModel } from "../models/rvb-account.model";
import { ConversationModel } from "../models/conversation.model";
import { MessageModel } from "../models/message.model";

const router = Router();
router.use(requireRvbAuth as any);

// GET /api/rvb/chats?category=main|secondary&search=
router.get("/", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { category, search } = req.query as any;
    const cat = category && !Array.isArray(category) ? String(category) : undefined;
    const q = search && !Array.isArray(search) ? String(search) : undefined;
    let convs;
    if (q) convs = await chatSvc.searchConversations(user.accountId, q, cat);
    else convs = await chatSvc.listConversationsForUser(user.accountId, cat);
    // Enrich with participant safe accounts and unread counts
    const unread = await chatSvc.getUnreadCounts(user.accountId);
    const allAccs = await RvbAccountModel.find({ id: { $in: convs.flatMap((c: any) => (c.participants as any[]).map((p: any) => p.accountId)) } }).lean().catch(() => []);
    const accMap = new Map(allAccs.map((a: any) => [a.id, a] as any));
    const enriched = convs.map((c: any) => ({
      ...c,
      participants: (c.participants as any[]).filter((p: any) => !p.leftAt).map((p: any) => {
        const ac: any = accMap.get(p.accountId);
        return {
          accountId: p.accountId,
          role: p.role,
          joinedAt: p.joinedAt,
          account: ac ? { id: ac.id, tag: ac.tag, displayName: ac.displayName, role: ac.role, profilePicture: ac.profilePicture, status: ac.status } : null,
        };
      }),
      unreadCount: unread[c.id] || 0,
    }));
    res.json({ success: true, conversations: enriched });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// POST /api/rvb/chats/dm { otherAccountId }
router.post("/dm", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { otherAccountId } = req.body as any;
    const conv = await chatSvc.createDM(user.accountId, otherAccountId);
    res.status(201).json({ success: true, conversation: conv });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// POST /api/rvb/chats/group { name, avatar, memberIds }
router.post("/group", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const { name, avatar, memberIds } = req.body as any;
    const conv = await chatSvc.createGroup(user.accountId, { name, avatar, memberIds: memberIds || [] });
    res.status(201).json({ success: true, conversation: conv });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// GET /api/rvb/chats/:id  detail
router.get("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const conv: any = await chatSvc.getConversationById(id, user.accountId);
    const accs = await RvbAccountModel.find({ id: { $in: (conv.participants as any[]).map((p: any) => p.accountId) } }).lean().catch(() => []);
    const accMap = new Map(accs.map((a: any) => [a.id, a] as any));
    const enriched = {
      ...conv,
      participants: (conv.participants as any[]).filter((p: any) => !p.leftAt).map((p: any) => {
        const ac: any = accMap.get(p.accountId);
        return {
          accountId: p.accountId,
          role: p.role,
          joinedAt: p.joinedAt,
          account: ac ? { id: ac.id, tag: ac.tag, displayName: ac.displayName, role: ac.role, profilePicture: ac.profilePicture, status: ac.status } : null,
        };
      }),
    };
    res.json({ success: true, conversation: enriched });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// POST /api/rvb/chats/:id/leave
router.post("/:id/leave", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const result = await chatSvc.leaveConversation(id, user.accountId);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// PATCH /api/rvb/chats/:id  update group
router.patch("/:id", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const { name, avatar, addMemberIds, removeMemberIds } = req.body as any;
    const conv = await chatSvc.updateGroup(id, user.accountId, { name, avatar, addMemberIds, removeMemberIds });
    res.json({ success: true, conversation: conv });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// Message routes

// GET /api/rvb/chats/:id/messages?before=&limit=&search=
router.get("/:id/messages", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const { before, limit, search } = req.query as any;
    const msgs = await chatSvc.listMessages(id, user.accountId, {
      before: before ? Number(Array.isArray(before) ? before[0] : before) : undefined,
      limit: limit ? Number(Array.isArray(limit) ? limit[0] : limit) : 30,
      search: search && !Array.isArray(search) ? String(search) : undefined,
    });
    res.json({ success: true, messages: msgs });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// POST /api/rvb/chats/:id/messages { content, replyTo, reminderMinutes | reminderAt(legacy) }
router.post("/:id/messages", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const { content, replyToMessageId, replyTo, reminderMinutes, reminderAt } = req.body as any;
    const reply = replyToMessageId || replyTo || null;
    // Prefer server-trusted reminderMinutes (30|60|120), fallback to legacy reminderAt timestamp
    const rm = reminderMinutes !== undefined && reminderMinutes !== null ? Number(reminderMinutes) : null;
    const legacyAt = reminderAt !== undefined && reminderAt !== null ? Number(reminderAt) : null;
    const msg = await chatSvc.sendMessage(id, user.accountId, content, reply, rm, legacyAt);
    // Emit via socket if available
    try {
      const { getIO } = await import("../lib/chat-socket");
      const io = getIO();
      if (io) {
        io.to(id).emit("chat:newMessage", { conversationId: id, message: msg });
        // Also emit unread update to other participants
        const conv: any = await ConversationModel.findOne({ id }).lean();
        if (conv) {
          for (const p of conv.participants as any[]) {
            if (p.accountId !== user.accountId && !p.leftAt) {
              io.to(`user:${p.accountId}`).emit("chat:unreadUpdate", { conversationId: id });
            }
          }
        }
      }
    } catch {}
    res.status(201).json({ success: true, message: msg });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// PATCH /api/rvb/chats/messages/:messageId  edit
router.patch("/messages/:messageId", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const mid = String((req.params as any).messageId);
    const { content } = req.body as any;
    const msg = await chatSvc.editMessage(mid, user.accountId, content);
    try {
      const { getIO } = await import("../lib/chat-socket");
      const io = getIO();
      if (io) io.to(msg.conversationId).emit("chat:messageEdited", { message: msg });
    } catch {}
    res.json({ success: true, message: msg });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// DELETE /api/rvb/chats/messages/:messageId
router.delete("/messages/:messageId", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const mid = String((req.params as any).messageId);
    const acc: any = await RvbAccountModel.findOne({ id: user.accountId }).lean();
    const isAdmin = acc?.role === "admin";
    const msg = await chatSvc.deleteMessage(mid, user.accountId, isAdmin);
    try {
      const { getIO } = await import("../lib/chat-socket");
      const io = getIO();
      if (io) io.to(msg.conversationId).emit("chat:messageDeleted", { messageId: mid, conversationId: msg.conversationId });
    } catch {}
    res.json({ success: true, message: msg });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// GET /api/rvb/chats/messages/:messageId/audit  admin only
router.get("/messages/:messageId/audit", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const mid = String((req.params as any).messageId);
    const data = await chatSvc.getMessageAudit(mid, user.accountId);
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// POST /api/rvb/chats/messages/:messageId/reaction  toggle 🤝
router.post("/messages/:messageId/reaction", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const mid = String((req.params as any).messageId);
    const msg = await chatSvc.toggleReaction(mid, user.accountId);
    try {
      const { getIO } = await import("../lib/chat-socket");
      const io = getIO();
      if (io) io.to(msg.conversationId).emit("chat:reactionUpdated", { message: msg });
    } catch {}
    res.json({ success: true, message: msg });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// POST /api/rvb/chats/:id/pin  { messageId }
router.post("/:id/pin", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const { messageId } = req.body as any;
    const conv = await chatSvc.pinMessage(id, messageId, user.accountId);
    try {
      const { getIO } = await import("../lib/chat-socket");
      const io = getIO();
      if (io) io.to(id).emit("chat:pinnedUpdated", { conversation: conv });
    } catch {}
    res.json({ success: true, conversation: conv });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

router.post("/:id/unpin", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const { messageId } = req.body as any;
    const conv = await chatSvc.unpinMessage(id, messageId, user.accountId);
    try {
      const { getIO } = await import("../lib/chat-socket");
      const io = getIO();
      if (io) io.to(id).emit("chat:pinnedUpdated", { conversation: conv });
    } catch {}
    res.json({ success: true, conversation: conv });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// POST /api/rvb/chats/:id/read { upToMessageId }
router.post("/:id/read", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const id = String((req.params as any).id);
    const { upToMessageId } = req.body as any;
    const result = await chatSvc.markRead(id, user.accountId, upToMessageId);
    try {
      const { getIO } = await import("../lib/chat-socket");
      const io = getIO();
      if (io) io.to(id).emit("chat:readReceipt", { conversationId: id, accountId: user.accountId, upToMessageId });
    } catch {}
    res.json(result as any);
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR", message: err?.message });
  }
});

// GET unread counts
router.get("/unread/counts", async (req: RvbAuthRequest, res) => {
  try {
    const user = req.rvbUser!;
    const counts = await chatSvc.getUnreadCounts(user.accountId);
    res.json({ success: true, counts });
  } catch (err: any) {
    res.status(err?.status || 500).json({ success: false, code: err?.code || "INTERNAL_ERROR" });
  }
});

export default router;
