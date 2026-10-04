import { v4 as uuidv4 } from "uuid";
import { ConversationModel } from "../models/conversation.model";
import { MessageModel } from "../models/message.model";
import { MessageAuditModel } from "../models/message-audit.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { createRvbNotification } from "./rvb-notification.service";
import { RvbChatReminderModel } from "../models/rvb-chat-reminder.model";

function codeError(code: string, status: number, message?: string) {
  const err = new Error(message || code) as any;
  err.code = code;
  err.status = status;
  return err;
}

const MESSAGE_MAX = 2000;
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const PIN_MAX = 3;
const RATE_LIMIT_WINDOW = 10000;
const RATE_LIMIT_MAX = 50;
const rateMap = new Map<string, number[]>();

function checkRate(accountId: string) {
  if (process.env.NODE_ENV === "test" || process.env.RVB_TEST_MODE === "true") return;
  const now = Date.now();
  const arr = rateMap.get(accountId) || [];
  const recent = arr.filter((t) => now - t < RATE_LIMIT_WINDOW);
  if (recent.length >= RATE_LIMIT_MAX) throw codeError("RVB_RATE_LIMIT", 429, "Too many messages");
  recent.push(now);
  rateMap.set(accountId, recent);
}

function toSafeConversation(doc: any) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : doc;
  return o;
}
function toSafeMessage(doc: any, forAdmin = false) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  if (!forAdmin && o.isDeleted) {
    return {
      ...o,
      content: "Message deleted",
      editHistory: [],
      attachments: [],
      // Keep audit only for admin, hide original
    };
  }
  return o;
}

// ---- Additive shared attachment contract (mobile + desktop safe) ----
// Stored inline as data URLs over the existing authenticated JSON pipeline:
// no separate upload endpoint, no secrets on device, membership/permission
// enforced by sendMessage before anything is persisted. Sized to stay well
// under the global express.json 1mb limit and Mongo document limits.
export type ChatAttachmentInput = {
  kind: "image" | "video";
  dataUrl: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
};

export const CHAT_ATTACHMENT_MAX_COUNT = 3;
// ~700k chars ≈ 525KB binary; keeps total JSON body under the 1mb server limit.
export const CHAT_ATTACHMENT_MAX_CHARS = 700_000;
const CHAT_IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const CHAT_VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export function validateChatAttachments(input: unknown): ChatAttachmentInput[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw codeError("RVB_ATTACHMENT_INVALID", 400, "Attachments must be an array");
  if (input.length > CHAT_ATTACHMENT_MAX_COUNT)
    throw codeError("RVB_ATTACHMENT_LIMIT", 400, `Max ${CHAT_ATTACHMENT_MAX_COUNT} attachments`);
  return (input as any[]).map((a: any, i: number) => {
    const kind = a?.kind;
    if (kind !== "image" && kind !== "video")
      throw codeError("RVB_ATTACHMENT_INVALID", 400, `Attachment ${i}: kind must be image|video`);
    const dataUrl = a?.dataUrl;
    if (typeof dataUrl !== "string" || dataUrl.length < 32)
      throw codeError("RVB_ATTACHMENT_INVALID", 400, `Attachment ${i}: dataUrl required`);
    if (dataUrl.length > CHAT_ATTACHMENT_MAX_CHARS)
      throw codeError("RVB_ATTACHMENT_TOO_LARGE", 413, `Attachment ${i} too large (max ~500KB)`);
    const mimeType = String(a?.mimeType || "").toLowerCase().split(";")[0].trim();
    if (kind === "image") {
      if (!CHAT_IMAGE_MIMES.has(mimeType))
        throw codeError("RVB_ATTACHMENT_TYPE", 400, `Attachment ${i}: image must be jpeg/png/webp`);
      if (!dataUrl.startsWith("data:image/"))
        throw codeError("RVB_ATTACHMENT_INVALID", 400, `Attachment ${i}: dataUrl must be data:image/...`);
    } else {
      if (!CHAT_VIDEO_MIMES.has(mimeType))
        throw codeError("RVB_ATTACHMENT_TYPE", 400, `Attachment ${i}: video must be mp4/mov/webm`);
      if (!dataUrl.startsWith("data:video/"))
        throw codeError("RVB_ATTACHMENT_INVALID", 400, `Attachment ${i}: dataUrl must be data:video/...`);
    }
    const size = Number(a?.size);
    if (!Number.isFinite(size) || size <= 0 || size > 800_000)
      throw codeError("RVB_ATTACHMENT_TOO_LARGE", 413, `Attachment ${i} size out of bounds`);
    const width = a?.width === undefined || a?.width === null ? null : Number(a.width);
    const height = a?.height === undefined || a?.height === null ? null : Number(a.height);
    return {
      kind,
      dataUrl,
      mimeType,
      size: Math.floor(size),
      width: Number.isFinite(width as number) && (width as number) > 0 ? Math.floor(width as number) : null,
      height: Number.isFinite(height as number) && (height as number) > 0 ? Math.floor(height as number) : null,
    };
  });
}

export function attachmentPreviewLabel(attachments: ChatAttachmentInput[]): string {
  if (attachments.some((a) => a.kind === "image") && attachments.some((a) => a.kind === "video")) return "[Media]";
  if (attachments.some((a) => a.kind === "image")) return "[Image]";
  if (attachments.some((a) => a.kind === "video")) return "[Video]";
  return "[Attachment]";
}

export function isManagementRole(role: string) {
  return ["manager", "admin", "supervisor"].includes(role);
}

export async function ensureMainChats() {
  // Deterministic ids for official groups
  const definitions: Array<{
    id: string;
    officialKind: "workers_group" | "suppliers_group" | "customers_group";
    name: string;
    category: "main";
    type: "official_group";
  }> = [
    { id: "main-workers", officialKind: "workers_group", name: "Workers", category: "main", type: "official_group" },
    { id: "main-suppliers", officialKind: "suppliers_group", name: "Suppliers", category: "main", type: "official_group" },
    { id: "main-customers", officialKind: "customers_group", name: "Customers", category: "main", type: "official_group" },
  ];
  const now = Date.now();
  for (const def of definitions) {
    const existing = await ConversationModel.findOne({ id: def.id }).lean();
    if (existing) continue;
    await ConversationModel.create({
      id: def.id,
      createdAt: now,
      updatedAt: now,
      category: def.category,
      type: def.type,
      officialKind: def.officialKind,
      name: def.name,
      avatar: null,
      createdBy: null,
      participants: [],
      dmKey: null,
      isSystemManaged: true,
      lastMessageAt: null,
      pinnedMessages: [],
    } as any);
  }
}

export async function syncMainMembership() {
  await ensureMainChats();
  const accounts = await RvbAccountModel.find({ status: "active" }).lean();
  const byId = new Map<string, any>();
  for (const a of accounts) byId.set(a.id, a);

  const managementIds = accounts.filter((a: any) => isManagementRole(a.role)).map((a: any) => a.id);
  const workerIds = accounts.filter((a: any) => a.role === "worker" && a.status === "active" && a.linkedEntityType === "worker").map((a: any) => a.id);
  const supplierIds = accounts.filter((a: any) => a.role === "supplier" && a.status === "active" && a.linkedEntityType === "supplier").map((a: any) => a.id);
  const customerIds = accounts.filter((a: any) => a.role === "customer" && a.status === "active" && a.linkedEntityType === "customer").map((a: any) => a.id);

  const groups: Record<string, string[]> = {
    "main-workers": [...new Set([...managementIds, ...workerIds])],
    "main-suppliers": [...new Set([...managementIds, ...supplierIds])],
    "main-customers": [...new Set([...managementIds, ...customerIds])],
  };
  const now = Date.now();
  for (const [cid, ids] of Object.entries(groups)) {
    const conv: any = await ConversationModel.findOne({ id: cid });
    if (!conv) continue;
    const desiredSet = new Set(ids);
    const currentActive = (conv.participants as any[]).filter((p: any) => !p.leftAt);
    const currentIds = new Set(currentActive.map((p: any) => p.accountId));
    // Compare membership + role snapshot before writing
    let same = desiredSet.size === currentIds.size && [...desiredSet].every((id) => currentIds.has(id));
    if (same) {
      // Check role snapshot drift
      for (const aid of ids) {
        const acc: any = byId.get(aid);
        const cur = (conv.participants as any[]).find((p: any) => p.accountId === aid && !p.leftAt);
        if (!cur || cur.role !== (acc?.role || cur.role)) { same = false; break; }
      }
    }
    if (same) continue; // already correct, avoid unnecessary write
    // Build participants with role snapshot
    const newParts = ids.map((aid) => {
      const acc: any = byId.get(aid);
      const existing = (conv.participants as any[]).find((p: any) => p.accountId === aid);
      return {
        accountId: aid,
        role: acc?.role || existing?.role || "unknown",
        joinedAt: existing?.joinedAt || now,
        leftAt: null,
      };
    });
    conv.participants = newParts;
    conv.updatedAt = now;
    await conv.save();
  }

  // Ensure admin↔entity private chats for each active worker/supplier/customer linked account where admin exists
  const admins = accounts.filter((a: any) => a.role === "admin" && a.status === "active");
  if (admins.length > 0) {
    // Use first admin as canonical admin for official private (or all admins? spec says Admin ↔ each). For simplicity create per admin per entity.
    for (const admin of admins) {
      for (const wid of workerIds) {
        const acc = byId.get(wid);
        await ensureOfficialPrivate("admin_worker", acc.linkedEntityId, acc.id, admin.id);
      }
      for (const sid of supplierIds) {
        const acc = byId.get(sid);
        await ensureOfficialPrivate("admin_supplier", acc.linkedEntityId, acc.id, admin.id);
      }
      for (const cid of customerIds) {
        const acc = byId.get(cid);
        await ensureOfficialPrivate("admin_customer", acc.linkedEntityId, acc.id, admin.id);
      }
    }
  }
}

export async function ensureOfficialPrivate(
  kind: "admin_worker" | "admin_supplier" | "admin_customer",
  entityId: string,
  entityAccountId: string,
  adminAccountId: string
) {
  const typeMap: Record<string, string> = {
    admin_worker: "workers_group",
    admin_supplier: "suppliers_group",
    admin_customer: "customers_group",
  };
  // deterministic id: official-private-${kind}-${entityId}-${adminId} ? But spec says one per entity lifecycle. If multiple admins, each admin has its own chat.
  const id = `official-private-${kind}-${entityId}-${adminAccountId}`;
  const existing = await ConversationModel.findOne({ id }).lean();
  if (existing) {
    // Ensure participants are correct (both present)
    const conv: any = await ConversationModel.findOne({ id });
    const participantIds = new Set((conv.participants as any[]).map((p: any) => p.accountId));
    let changed = false;
    for (const aid of [entityAccountId, adminAccountId]) {
      if (!participantIds.has(aid)) {
        const acc: any = await RvbAccountModel.findOne({ id: aid }).lean();
        conv.participants.push({ accountId: aid, role: acc?.role || "unknown", joinedAt: Date.now(), leftAt: null });
        changed = true;
      }
    }
    if (changed) {
      conv.updatedAt = Date.now();
      await conv.save();
    }
    return conv.toObject ? conv.toObject() : conv;
  }
  const now = Date.now();
  const adminAcc: any = await RvbAccountModel.findOne({ id: adminAccountId }).lean();
  const entityAcc: any = await RvbAccountModel.findOne({ id: entityAccountId }).lean();
  const created = await ConversationModel.create({
    id,
    createdAt: now,
    updatedAt: now,
    category: "main",
    type: "official_private",
    officialKind: kind,
    name: null,
    avatar: null,
    createdBy: adminAccountId,
    participants: [
      { accountId: adminAccountId, role: adminAcc?.role || "admin", joinedAt: now, leftAt: null },
      { accountId: entityAccountId, role: entityAcc?.role || "unknown", joinedAt: now, leftAt: null },
    ],
    dmKey: null,
    linkedEntityType: kind.split("_")[1],
    linkedEntityId: entityId,
    linkedAccountId: entityAccountId,
    adminAccountId: adminAccountId,
    isSystemManaged: true,
    lastMessageAt: null,
    pinnedMessages: [],
  } as any);
  return created.toObject ? created.toObject() : created;
}

export function parseMentions(content: string): string[] {
  if (!content) return [];
  // Match @workers @suppliers @customers @managers @everyone and also @tag mentions? Keep simple for group tags
  const tags: string[] = [];
  const re = /@(workers|suppliers|customers|managers|everyone)\b/gi;
  let m: any;
  while ((m = re.exec(content)) !== null) tags.push(m[1].toLowerCase());
  return [...new Set(tags)];
}

// Access checks
export function canAccessConversation(conv: any, accountId: string, role: string): boolean {
  if (!conv) return false;
  // Check participants includes accountId and leftAt null
  const p = (conv.participants as any[]).find((x: any) => x.accountId === accountId && !x.leftAt);
  if (p) return true;
  // For main system groups, allow if role is management and conv is main-workers etc even if not participant due to sync lag? But we require participant.
  return false;
}

export function isParticipant(conv: any, accountId: string): boolean {
  return (conv.participants as any[]).some((p: any) => p.accountId === accountId && !p.leftAt);
}

export async function listConversationsForUser(accountId: string, category?: string) {
  await syncMainMembership(); // ensure up to date on each list (could be cached but okay)
  const acc: any = await RvbAccountModel.findOne({ id: accountId }).lean();
  if (!acc || acc.status !== "active") throw codeError("RVB_FORBIDDEN", 403);
  const filter: any = { "participants.accountId": accountId, "participants.leftAt": null };
  if (category && category !== "all") filter.category = category;
  // For main, we want to ensure sync already added; but for secondary we fetch
  const convs = await ConversationModel.find(filter).sort({ lastMessageAt: -1, updatedAt: -1 }).lean();
  // Filter out left participants accurately (mongo filter above may not handle array element condition correctly)
  const filtered = convs.filter((c: any) => (c.participants as any[]).some((p: any) => p.accountId === accountId && !p.leftAt));
  // Attach computed unread counts and participant safe data will be enriched by caller
  return filtered;
}

export async function getConversationById(convId: string, requesterId: string) {
  const conv: any = await ConversationModel.findOne({ id: convId }).lean();
  if (!conv) throw codeError("RVB_CONVERSATION_NOT_FOUND", 404);
  const acc: any = await RvbAccountModel.findOne({ id: requesterId }).lean();
  if (!acc) throw codeError("RVB_FORBIDDEN", 403);
  if (!isParticipant(conv, requesterId)) throw codeError("RVB_FORBIDDEN", 403, "Not member");
  return conv;
}

export async function createDM(requesterId: string, otherAccountId: string) {
  if (!otherAccountId) throw codeError("RVB_ACCOUNT_REQUIRED", 400);
  if (requesterId === otherAccountId) throw codeError("RVB_DM_SELF", 400);
  const [me, other]: any[] = await Promise.all([
    RvbAccountModel.findOne({ id: requesterId }).lean(),
    RvbAccountModel.findOne({ id: otherAccountId }).lean(),
  ]);
  if (!me || me.status !== "active") throw codeError("RVB_FORBIDDEN", 403);
  if (!other || other.status !== "active") throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
  // Archived cannot create?
  // DM uniqueness: sorted key
  const sorted = [requesterId, otherAccountId].sort();
  const dmKey = `dm:${sorted[0]}:${sorted[1]}`;
  // Check existing DM in secondary with same dmKey
  const existing = await ConversationModel.findOne({ dmKey, category: "secondary", type: "dm" }).lean();
  if (existing) return existing;
  const now = Date.now();
  const created = await ConversationModel.create({
    id: `conv-${uuidv4()}`,
    createdAt: now,
    updatedAt: now,
    category: "secondary",
    type: "dm",
    officialKind: null,
    name: null,
    avatar: null,
    createdBy: requesterId,
    participants: [
      { accountId: requesterId, role: me.role, joinedAt: now, leftAt: null },
      { accountId: otherAccountId, role: other.role, joinedAt: now, leftAt: null },
    ],
    dmKey,
    isSystemManaged: false,
    lastMessageAt: null,
    pinnedMessages: [],
  } as any);
  return created.toObject ? created.toObject() : created;
}

export async function createGroup(requesterId: string, input: { name: string; avatar?: string | null; memberIds: string[] }) {
  if (!input.name || !input.name.trim()) throw codeError("RVB_GROUP_NAME_REQUIRED", 400);
  if (!Array.isArray(input.memberIds) || input.memberIds.length === 0) throw codeError("RVB_MEMBERS_REQUIRED", 400);
  const me: any = await RvbAccountModel.findOne({ id: requesterId }).lean();
  if (!me || me.status !== "active") throw codeError("RVB_FORBIDDEN", 403);
  const unique = [...new Set([requesterId, ...input.memberIds])];
  if (unique.length < 2) throw codeError("RVB_MEMBERS_REQUIRED", 400);
  // Validate members active
  const accs: any[] = await RvbAccountModel.find({ id: { $in: unique } }).lean();
  const activeIds = new Set(accs.filter((a: any) => a.status === "active").map((a: any) => a.id));
  for (const id of unique) if (!activeIds.has(id)) throw codeError("RVB_ACCOUNT_NOT_FOUND", 404, `Member ${id} not active`);
  const now = Date.now();
  const created = await ConversationModel.create({
    id: `conv-${uuidv4()}`,
    createdAt: now,
    updatedAt: now,
    category: "secondary",
    type: "group",
    officialKind: null,
    name: input.name.trim().slice(0, 80),
    avatar: input.avatar || null,
    createdBy: requesterId,
    participants: unique.map((aid) => {
      const acc: any = accs.find((a: any) => a.id === aid);
      return { accountId: aid, role: acc?.role || "unknown", joinedAt: now, leftAt: null };
    }),
    dmKey: null,
    isSystemManaged: false,
    lastMessageAt: now,
    pinnedMessages: [],
  } as any);
  return created.toObject ? created.toObject() : created;
}

export async function leaveConversation(convId: string, accountId: string) {
  const conv: any = await ConversationModel.findOne({ id: convId });
  if (!conv) throw codeError("RVB_CONVERSATION_NOT_FOUND", 404);
  if (conv.isSystemManaged) throw codeError("RVB_FORBIDDEN", 403, "Cannot leave system chat");
  const part = (conv.participants as any[]).find((p: any) => p.accountId === accountId && !p.leftAt);
  if (!part) throw codeError("RVB_FORBIDDEN", 403, "Not member");
  part.leftAt = Date.now();
  conv.updatedAt = Date.now();
  await conv.save();
  const remaining = (conv.participants as any[]).filter((p: any) => !p.leftAt);
  if (remaining.length === 0) {
    // Delete conversation and its messages/audits (preserve audit? spec says last member leaves -> remove/close; we will delete messages after audit retention? For now soft archive and keep audits)
    await MessageModel.deleteMany({ conversationId: convId });
    await ConversationModel.deleteOne({ id: convId });
    return null;
  }
  if (conv.type === "group" && remaining.length === 1) {
    // keep group with one member
  }
  return conv.toObject ? conv.toObject() : conv;
}

export async function updateGroup(convId: string, accountId: string, input: { name?: string; avatar?: string | null; addMemberIds?: string[]; removeMemberIds?: string[] }) {
  const conv: any = await ConversationModel.findOne({ id: convId });
  if (!conv) throw codeError("RVB_CONVERSATION_NOT_FOUND", 404);
  if (conv.isSystemManaged) throw codeError("RVB_FORBIDDEN", 403);
  if (!isParticipant(conv, accountId)) throw codeError("RVB_FORBIDDEN", 403);
  if (conv.type !== "group") throw codeError("RVB_FORBIDDEN", 400, "Only groups can be renamed");
  const now = Date.now();
  if (input.name !== undefined) {
    if (!input.name.trim()) throw codeError("RVB_GROUP_NAME_REQUIRED", 400);
    conv.name = input.name.trim().slice(0, 80);
  }
  if (input.avatar !== undefined) conv.avatar = input.avatar || null;
  if (input.addMemberIds && input.addMemberIds.length) {
    for (const aid of input.addMemberIds) {
      if ((conv.participants as any[]).some((p: any) => p.accountId === aid && !p.leftAt)) continue;
      const acc: any = await RvbAccountModel.findOne({ id: aid }).lean();
      if (!acc || acc.status !== "active") throw codeError("RVB_ACCOUNT_NOT_FOUND", 404);
      conv.participants.push({ accountId: aid, role: acc.role, joinedAt: now, leftAt: null });
    }
  }
  if (input.removeMemberIds && input.removeMemberIds.length) {
    for (const aid of input.removeMemberIds) {
      const p: any = (conv.participants as any[]).find((x: any) => x.accountId === aid && !x.leftAt);
      if (p) p.leftAt = now;
    }
  }
  conv.updatedAt = now;
  await conv.save();
  return conv.toObject ? conv.toObject() : conv;
}

// Message operations
export async function sendMessage(convId: string, senderId: string, content: string, replyTo?: string | null, reminderMinutes?: number | null, reminderAtLegacy?: number | null, attachmentsInput?: unknown) {
  const attachments = validateChatAttachments(attachmentsInput);
  const trimmed = typeof content === "string" ? content.trim() : "";
  if (!trimmed && attachments.length === 0) throw codeError("RVB_CONTENT_REQUIRED", 400);
  if (trimmed.length > MESSAGE_MAX) throw codeError("RVB_CONTENT_TOO_LONG", 400);
  const conv: any = await ConversationModel.findOne({ id: convId });
  if (!conv) throw codeError("RVB_CONVERSATION_NOT_FOUND", 404);
  const sender: any = await RvbAccountModel.findOne({ id: senderId }).lean();
  if (!sender || sender.status !== "active") throw codeError("RVB_FORBIDDEN", 403);
  if (!isParticipant(conv, senderId)) throw codeError("RVB_FORBIDDEN", 403, "Not member");
  checkRate(senderId);
  if (replyTo) {
    const orig: any = await MessageModel.findOne({ id: replyTo, conversationId: convId }).lean();
    if (!orig) throw codeError("RVB_MESSAGE_NOT_FOUND", 404);
  }
  const mentions = parseMentions(trimmed);
  // Validate mentions against conversation context: only allow relevant
  // For official groups, filter allowed. For others allow all group tags but not meaningless? For simplicity enforce: workers_group allows @workers/@managers/@everyone etc.
  const allowedByKind: Record<string, string[]> = {
    workers_group: ["workers", "managers", "everyone"],
    suppliers_group: ["suppliers", "managers", "everyone"],
    customers_group: ["customers", "managers", "everyone"],
  };
  if (conv.officialKind && allowedByKind[conv.officialKind]) {
    const allowed = allowedByKind[conv.officialKind];
    const invalid = mentions.filter((m) => !allowed.includes(m));
    if (invalid.length) throw codeError("RVB_MENTION_NOT_ALLOWED", 400, `Mentions not allowed: ${invalid.join(",")}`);
  }
  // For private/dms, mentions may be irrelevant but allow
  const now = Date.now();
  // Normalize reminder: prefer reminderMinutes (30|60|120), fallback to legacy reminderAt
  // Support legacy call where 5th arg is timestamp (Date.now()+...)
  let effectiveReminderAt: number | null = null;
  if (reminderMinutes && [30, 60, 120].includes(Number(reminderMinutes))) {
    effectiveReminderAt = now + Number(reminderMinutes) * 60 * 1000;
  } else if (reminderAtLegacy && Number(reminderAtLegacy) > now) {
    effectiveReminderAt = Number(reminderAtLegacy);
  } else if (reminderMinutes && Number(reminderMinutes) > now) {
    // legacy call: sendMessage(..., reminderAt) where reminderAt is timestamp in 5th position
    effectiveReminderAt = Number(reminderMinutes);
  }
  const msg: any = await MessageModel.create({
    id: `msg-${uuidv4()}`,
    createdAt: now,
    updatedAt: now,
    conversationId: convId,
    senderAccountId: senderId,
    content: trimmed,
    replyToMessageId: replyTo || null,
    editedAt: null,
    deletedAt: null,
    deletedBy: null,
    isDeleted: false,
    editHistory: [],
    reactions: [],
    readBy: [{ accountId: senderId, readAt: now }],
    mentions,
    reminderAt: effectiveReminderAt,
    attachments,
  } as any);
  await MessageAuditModel.create({
    id: `audit-${uuidv4()}`,
    createdAt: now,
    messageId: msg.id,
    conversationId: convId,
    action: "create",
    actorAccountId: senderId,
    contentSnapshot: trimmed || attachmentPreviewLabel(attachments),
  } as any);
  conv.lastMessageAt = now;
  conv.lastMessagePreview = (trimmed || attachmentPreviewLabel(attachments)).slice(0, 80);
  conv.lastMessageSenderId = senderId;
  conv.updatedAt = now;
  await conv.save();
  // Centralized R.V.B notification delivery with precise targeting
  try {
    const sourceEventId = `chat:msg:${msg.id}:notif`;
    // Determine precise recipients
    let recipientIds: string[] = [];
    let isMention = false;
    let isReply = false;
    const participants = (conv.participants as any[]).filter((p: any) => !p.leftAt).map((p: any) => p.accountId);
    const participantsExSender = participants.filter((id) => id !== senderId);
    // Fetch participant accounts for role resolution
    const participantAccounts: any[] = await RvbAccountModel.find({ id: { $in: participantsExSender } }).lean().catch(() => [] as any[]);
    const accountById = new Map(participantAccounts.map((a: any) => [a.id, a]));
    const isParticipant = (id: string) => participants.includes(id);

    // DM: direct recipient
    if (conv.type === "dm") {
      const other = (conv.participants as any[]).find((p: any) => p.accountId !== senderId && !p.leftAt);
      if (other && isParticipant(other.accountId)) recipientIds = [other.accountId];
    } else {
      // Group mentions: @workers, @suppliers, @customers, @managers, @everyone
      const groupMentionMap: Record<string, (acc: any) => boolean> = {
        workers: (acc) => acc?.role === "worker",
        suppliers: (acc) => acc?.role === "supplier",
        customers: (acc) => acc?.role === "customer",
        managers: (acc) => ["manager", "admin", "supervisor"].includes(acc?.role),
        everyone: () => true,
      };
      for (const tag of mentions) {
        const matcher = groupMentionMap[tag.toLowerCase()];
        if (matcher) {
          isMention = true;
          for (const pid of participantsExSender) {
            const acc = accountById.get(pid);
            if (acc && matcher(acc)) recipientIds.push(pid);
          }
        }
      }
      // Individual @tag mentions
      const individualTagRegex = /@([a-z0-9._]{3,30})/gi;
      let m: any;
      const contentLower = trimmed.toLowerCase();
      // Use original content for tag extraction but compare lower
      const tagMatches = [...trimmed.matchAll(/@([a-z0-9._]{3,30})/gi)].map((x) => x[1].toLowerCase());
      for (const tag of tagMatches) {
        // Skip group tags already handled
        if (["workers", "suppliers", "customers", "managers", "everyone"].includes(tag)) continue;
        const acc = participantAccounts.find((a: any) => a.tag.toLowerCase() === tag);
        if (acc && isParticipant(acc.id)) {
          isMention = true;
          recipientIds.push(acc.id);
        }
      }
      // Reply notification
      if (replyTo) {
        const orig: any = await MessageModel.findOne({ id: replyTo }).lean().catch(() => null);
        if (orig && orig.senderAccountId !== senderId && isParticipant(orig.senderAccountId)) {
          isReply = true;
          recipientIds.push(orig.senderAccountId);
        }
      }
      // Deduplicate
      recipientIds = [...new Set(recipientIds)];
      // If no mention/reply and not DM, do not flood group with generic message notification
      // Only notify for DMs, mentions, replies, or if explicitly needed
      if (recipientIds.length === 0) {
        // No precise target, skip general group message notification
      }
    }

    // Ensure we don't notify sender and deduplicate
    recipientIds = [...new Set(recipientIds.filter((id) => id !== senderId && isParticipant(id)))];

    if (recipientIds.length > 0) {
      const title = conv.type === "dm" ? `New message from @${sender.tag}` : isMention || isReply ? `You were mentioned in ${conv.name || getOfficialName(conv)}` : `New message in ${conv.name || getOfficialName(conv)}`;
      const category: any = isMention || isReply ? "mentions" : conv.type === "dm" ? "chats" : "chats";
      await createRvbNotification({
        type: "system",
        severity: isMention || isReply ? "warning" : "info",
        title,
        message: (trimmed || attachmentPreviewLabel(attachments)).slice(0, 120),
        entityType: "conversation",
        entityId: convId,
        route: "/rvb/chats",
        sourceEventId,
        audienceType: "user",
        audienceIds: recipientIds,
        priority: isMention || isReply ? "high" : "normal",
        category,
        mandatory: false,
        isMention,
        isReply,
      } as any);
      // Per-recipient reminders
      if (effectiveReminderAt && recipientIds.length > 0) {
        const mins = Math.round((effectiveReminderAt - now) / 60000);
        if ([30, 60, 120].includes(mins)) {
          for (const rid of recipientIds) {
            try {
              await RvbChatReminderModel.updateOne(
                { messageId: msg.id, recipientAccountId: rid },
                {
                  $setOnInsert: {
                    id: `rem-${uuidv4()}`,
                    messageId: msg.id,
                    conversationId: convId,
                    recipientAccountId: rid,
                    createdByAccountId: senderId,
                    dueAt: effectiveReminderAt,
                    createdAt: now,
                  },
                },
                { upsert: true },
              );
            } catch {}
          }
        }
      }
    }
  } catch {}
  try {
    const { RvbActivityModel } = await import("../models/rvb-activity.model");
    // Privacy: do not store message content in activity details
    await RvbActivityModel.create({
      id: `rvba-${uuidv4()}`,
      createdAt: now,
      actorAccountId: senderId,
      actorTag: sender.tag,
      actorRole: sender.role,
      entityType: "conversation",
      entityId: convId,
      action: "message_sent",
      sourceType: "chats",
      sourceId: msg.id,
      title: `Message sent in ${conv.name || getOfficialName(conv)}`,
      details: conv.type === "official_group" ? `Message in ${getOfficialName(conv)}` : "Message sent in conversation",
    } as any);
  } catch {}
  return msg.toObject ? msg.toObject() : msg;
}

function getOfficialName(conv: any): string {
  if (conv.officialKind === "workers_group") return "Workers";
  if (conv.officialKind === "suppliers_group") return "Suppliers";
  if (conv.officialKind === "customers_group") return "Customers";
  return conv.name || "Chat";
}

export async function editMessage(messageId: string, editorId: string, newContent: string) {
  if (!newContent || !newContent.trim()) throw codeError("RVB_CONTENT_REQUIRED", 400);
  if (newContent.trim().length > MESSAGE_MAX) throw codeError("RVB_CONTENT_TOO_LONG", 400);
  const msg: any = await MessageModel.findOne({ id: messageId });
  if (!msg) throw codeError("RVB_MESSAGE_NOT_FOUND", 404);
  if (msg.isDeleted) throw codeError("RVB_MESSAGE_DELETED", 400);
  if (msg.senderAccountId !== editorId) throw codeError("RVB_FORBIDDEN", 403);
  const now = Date.now();
  if (now - msg.createdAt > EDIT_WINDOW_MS) throw codeError("RVB_EDIT_WINDOW_EXPIRED", 400);
  const old = msg.content;
  msg.editHistory.push({ content: old, editedAt: now, editedBy: editorId });
  msg.content = newContent.trim();
  msg.editedAt = now;
  msg.updatedAt = now;
  msg.mentions = parseMentions(newContent);
  await msg.save();
  await MessageAuditModel.create({
    id: `audit-${uuidv4()}`,
    createdAt: now,
    messageId: msg.id,
    conversationId: msg.conversationId,
    action: "edit",
    actorAccountId: editorId,
    previousContent: old,
    newContent: newContent.trim(),
  } as any);
  const conv: any = await ConversationModel.findOne({ id: msg.conversationId });
  if (conv) {
    conv.updatedAt = now;
    conv.lastMessageAt = now;
    await conv.save();
  }
  return msg.toObject ? msg.toObject() : msg;
}

export async function deleteMessage(messageId: string, deleterId: string, isAdmin = false) {
  const msg: any = await MessageModel.findOne({ id: messageId });
  if (!msg) throw codeError("RVB_MESSAGE_NOT_FOUND", 404);
  if (msg.isDeleted) throw codeError("RVB_ALREADY_DELETED", 400);
  // Only sender can delete, unless admin audited delete? For now only sender
  if (msg.senderAccountId !== deleterId && !isAdmin) throw codeError("RVB_FORBIDDEN", 403);
  msg.isDeleted = true;
  msg.deletedAt = Date.now();
  msg.deletedBy = deleterId;
  msg.updatedAt = Date.now();
  await msg.save();
  await MessageAuditModel.create({
    id: `audit-${uuidv4()}`,
    createdAt: Date.now(),
    messageId: msg.id,
    conversationId: msg.conversationId,
    action: "delete",
    actorAccountId: deleterId,
    contentSnapshot: msg.content,
  } as any);
  return msg.toObject ? msg.toObject() : msg;
}

export async function getMessageAudit(messageId: string, requesterId: string) {
  const acc: any = await RvbAccountModel.findOne({ id: requesterId }).lean();
  if (!acc || acc.role !== "admin") throw codeError("RVB_FORBIDDEN", 403);
  const audits = await MessageAuditModel.find({ messageId }).sort({ createdAt: 1 }).lean();
  const msg: any = await MessageModel.findOne({ id: messageId }).lean();
  return { message: msg, audits };
}

export async function toggleReaction(messageId: string, accountId: string) {
  const msg: any = await MessageModel.findOne({ id: messageId });
  if (!msg) throw codeError("RVB_MESSAGE_NOT_FOUND", 404);
  const conv: any = await ConversationModel.findOne({ id: msg.conversationId }).lean();
  if (!isParticipant(conv, accountId)) throw codeError("RVB_FORBIDDEN", 403);
  const emoji = "🤝";
  const idx = (msg.reactions as any[]).findIndex((r: any) => r.accountId === accountId && r.emoji === emoji);
  if (idx >= 0) {
    msg.reactions.splice(idx, 1);
  } else {
    msg.reactions.push({ accountId, emoji, createdAt: Date.now() });
  }
  msg.updatedAt = Date.now();
  await msg.save();
  return msg.toObject ? msg.toObject() : msg;
}

export async function pinMessage(conversationId: string, messageId: string, accountId: string) {
  const msg: any = await MessageModel.findOne({ id: messageId, conversationId }).lean();
  if (!msg) throw codeError("RVB_MESSAGE_NOT_FOUND", 404);
  const now = Date.now();
  // Atomic claim: push only if not already pinned and count < 3
  const updated: any = await ConversationModel.findOneAndUpdate(
    {
      id: conversationId,
      "participants.accountId": accountId,
      "participants.leftAt": null,
      "pinnedMessages.messageId": { $ne: messageId },
      $expr: { $lt: [{ $size: { $ifNull: ["$pinnedMessages", []] } }, PIN_MAX] },
    },
    {
      $push: { pinnedMessages: { messageId, pinnedBy: accountId, pinnedAt: now } },
      $set: { updatedAt: now },
    },
    { new: true },
  );
  if (updated) return updated.toObject ? updated.toObject() : updated;
  // Determine why it failed
  const conv: any = await ConversationModel.findOne({ id: conversationId });
  if (!conv) throw codeError("RVB_CONVERSATION_NOT_FOUND", 404);
  if (!isParticipant(conv, accountId)) throw codeError("RVB_FORBIDDEN", 403);
  if ((conv.pinnedMessages as any[]).some((p: any) => p.messageId === messageId)) throw codeError("RVB_ALREADY_PINNED", 409);
  if ((conv.pinnedMessages as any[]).length >= PIN_MAX) throw codeError("RVB_PIN_LIMIT", 409, "Max 3 pinned messages");
  throw codeError("RVB_PIN_LIMIT", 409, "Max 3 pinned messages");
}

export async function unpinMessage(conversationId: string, messageId: string, accountId: string) {
  const conv: any = await ConversationModel.findOne({ id: conversationId });
  if (!conv) throw codeError("RVB_CONVERSATION_NOT_FOUND", 404);
  if (!isParticipant(conv, accountId)) throw codeError("RVB_FORBIDDEN", 403);
  const idx = (conv.pinnedMessages as any[]).findIndex((p: any) => p.messageId === messageId);
  if (idx < 0) throw codeError("RVB_NOT_PINNED", 404);
  conv.pinnedMessages.splice(idx, 1);
  conv.updatedAt = Date.now();
  await conv.save();
  return conv.toObject ? conv.toObject() : conv;
}

export async function markRead(conversationId: string, accountId: string, upToMessageId?: string) {
  const conv: any = await ConversationModel.findOne({ id: conversationId }).lean();
  if (!conv || !isParticipant(conv, accountId)) throw codeError("RVB_FORBIDDEN", 403);
  const now = Date.now();
  const filter: any = {
    conversationId,
    isDeleted: false,
    readBy: { $not: { $elemMatch: { accountId } } },
  };
  if (upToMessageId) {
    const upMsg: any = await MessageModel.findOne({ id: upToMessageId }).lean();
    if (!upMsg) throw codeError("RVB_MESSAGE_NOT_FOUND", 404);
    filter.createdAt = { $lte: upMsg.createdAt };
  }
  // Efficient single updateMany, no duplicate readBy
  await MessageModel.updateMany(filter as any, { $push: { readBy: { accountId, readAt: now } } } as any);
  return { success: true };
}

export async function listMessages(conversationId: string, requesterId: string, opts: { before?: number; limit?: number; search?: string } = {}) {
  const conv: any = await ConversationModel.findOne({ id: conversationId }).lean();
  if (!conv || !isParticipant(conv, requesterId)) throw codeError("RVB_FORBIDDEN", 403);
  const limit = Math.min(Math.max(opts.limit || 30, 1), 100);
  const filter: any = { conversationId };
  if (opts.before) filter.createdAt = { $lt: opts.before };
  if (opts.search) filter.content = { $regex: opts.search, $options: "i" };
  // Exclude deleted for normal users? We include but hide content
  const msgs = await MessageModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  // Return oldest first for UI
  const reversed = msgs.reverse();
  const isAdmin = (await RvbAccountModel.findOne({ id: requesterId }).lean() as any)?.role === "admin";
  return reversed.map((m: any) => toSafeMessage(m, isAdmin));
}

export async function getUnreadCounts(accountId: string) {
  const convs = await listConversationsForUser(accountId);
  if (convs.length === 0) return {};
  const convIds = (convs as any[]).map((c) => c.id);
  const counts: Record<string, number> = {};
  for (const id of convIds) counts[id] = 0;
  // Use aggregation to avoid loading bodies, exclude own messages and already-read
  const agg = await MessageModel.aggregate([
    {
      $match: {
        conversationId: { $in: convIds },
        isDeleted: false,
        senderAccountId: { $ne: accountId },
        readBy: { $not: { $elemMatch: { accountId } } },
      },
    },
    { $group: { _id: "$conversationId", count: { $sum: 1 } } },
  ]);
  for (const row of agg as any[]) {
    counts[row._id] = row.count;
  }
  return counts;
}

export async function searchConversations(accountId: string, query: string, category?: string) {
  const convs = await listConversationsForUser(accountId, category);
  if (!query || !query.trim()) return convs;
  const q = query.trim().toLowerCase();
  // Need to enrich with names/tags for search
  const allAccounts = await RvbAccountModel.find({}).lean();
  const accMap = new Map(allAccounts.map((a: any) => [a.id, a] as any));
  return convs.filter((c: any) => {
    const name = (c.name || getOfficialName(c) || "").toLowerCase();
    const participantsLabels = (c.participants as any[])
      .map((p: any) => {
        const ac: any = accMap.get(p.accountId);
        return `${ac?.displayName || ""} ${ac?.tag || ""} ${ac?.role || ""}`.toLowerCase();
      })
      .join(" ");
    const hay = `${name} ${c.id} ${participantsLabels}`.toLowerCase();
    if (hay.includes(q)) return true;
    const nq = q.startsWith("@") ? q.slice(1) : q;
    if (nq && participantsLabels.includes(nq)) return true;
    return false;
  });
}

export function toSafeAccount(acc: any) {
  if (!acc) return null;
  const { passwordHash, ...rest } = acc;
  return rest;
}
