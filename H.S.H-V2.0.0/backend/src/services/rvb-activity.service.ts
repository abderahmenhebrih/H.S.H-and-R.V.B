import { v4 as uuidv4 } from "uuid";
import { RvbActivityModel } from "../models/rvb-activity.model";
import { ConversationModel } from "../models/conversation.model";
import { MessageModel } from "../models/message.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { CustomerOrderModel } from "../models/customer-order.model";

export interface CreateActivityInput {
  actorAccountId?: string | null;
  actorTag?: string | null;
  actorRole?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  action: string;
  sourceType: "accounts" | "workers" | "suppliers" | "customers" | "requests" | "orders" | "chats" | "system";
  sourceId?: string | null;
  title?: string | null;
  details?: string | null;
}

// Helper to sanitize chat details: never store message content, use safe metadata
function sanitizeChatDetails(input: CreateActivityInput): string | null {
  if (input.sourceType !== "chats") return input.details || null;
  // For chats, do not store message content. Use safe generic metadata.
  // Prefer title for context but details stays generic "Chat activity" or "Message sent in ..."
  // If caller provided title like "Message sent in Workers", keep details generic.
  return "Chat activity";
}

export async function recordActivity(input: CreateActivityInput) {
  const now = Date.now();
  // Privacy: for chat source, sanitize details to not contain message content
  let safeDetails = input.details || null;
  if (input.sourceType === "chats") {
    safeDetails = sanitizeChatDetails(input);
  }
  const doc = await RvbActivityModel.create({
    id: `rvba-${uuidv4()}`,
    createdAt: now,
    actorAccountId: input.actorAccountId || null,
    actorTag: input.actorTag || null,
    actorRole: input.actorRole || null,
    entityType: input.entityType || null,
    entityId: input.entityId || null,
    action: input.action,
    sourceType: input.sourceType,
    sourceId: input.sourceId || null,
    title: input.title || input.action,
    details: safeDetails,
  } as any);
  return doc.toObject();
}

// Redact historic chat details at serialization layer
function redactChatActivity<T extends { sourceType?: string; details?: string | null }>(doc: T): T {
  if (!doc) return doc;
  if ((doc as any).sourceType === "chats") {
    // Return null or "Chat activity" instead of message preview
    // We keep title as is but redact details
    return { ...doc, details: null } as T;
    // Alternative could be "Chat activity": details: "Chat activity"
  }
  return doc;
}

export async function listActivitiesForUser(params: {
  accountId: string;
  role: string;
  source?: string;
  search?: string;
  date?: string;
  actor?: string;
  page?: number;
  limit?: number;
}) {
  const { accountId, role, source, search, date, actor, page = 1, limit = 25 } = params;
  const isManager = role === "manager" || role === "admin";
  const isSupervisor = role === "supervisor";

  // Fetch linked entity info for scope
  let linkedEntityType: string | null = null;
  let linkedEntityId: string | null = null;
  try {
    const acc: any = await RvbAccountModel.findOne({ id: accountId }).lean();
    if (acc) {
      linkedEntityType = acc.linkedEntityType || null;
      linkedEntityId = acc.linkedEntityId || null;
    }
  } catch {}

  // For chat-source activity visibility: participant check
  // Query ConversationModel for conversations where participants.accountId == current user, collect conversationIds
  let allowedConversationIds: string[] = [];
  let allowedMessageIds: string[] = [];
  try {
    const convs: any[] = await ConversationModel.find({ "participants.accountId": accountId }).lean();
    // Filter to active participants (leftAt null)
    allowedConversationIds = convs
      .filter((c: any) => (c.participants as any[]).some((p: any) => p.accountId === accountId && !p.leftAt))
      .map((c: any) => c.id);
    if (allowedConversationIds.length > 0) {
      const msgs: any[] = await MessageModel.find({ conversationId: { $in: allowedConversationIds } }).select("id").lean().catch(() => [] as any[]);
      allowedMessageIds = msgs.map((m: any) => m.id);
    }
  } catch {
    allowedConversationIds = [];
    allowedMessageIds = [];
  }

  // Build chat allowed OR branches (used in all role scopes)
  const chatAllowedBranches: any[] = [];
  // Only add if we have ids; but even with empty arrays, we add branches that will match nothing (in [] matches none) – to prevent blanket visibility
  // We keep branches always, but with empty arrays they safely match nothing
  chatAllowedBranches.push({ sourceType: "chats", entityId: { $in: allowedConversationIds } });
  chatAllowedBranches.push({ sourceType: "chats", sourceId: { $in: allowedConversationIds } });
  chatAllowedBranches.push({ sourceType: "chats", sourceId: { $in: allowedMessageIds } });

  const filters: any[] = [];

  // Scope filtering with proper portal scopes and private chat participant restriction
  if (isManager) {
    // Manager/Admin broad but still private chat only when participant
    // Allow all non-chat activities, plus only participant chats
    const scopeOr: any[] = [{ sourceType: { $ne: "chats" } }, ...chatAllowedBranches];
    filters.push({ $or: scopeOr });
  } else if (isSupervisor) {
    const scopeOr: any[] = [...chatAllowedBranches];
    // Supervisor own linked Worker + Customer-management + own actions (non-chat)
    // Own linked Worker: entityType worker and entityId = linkedEntityId (supervisor linkedEntityType is worker)
    if (linkedEntityType === "worker" && linkedEntityId) {
      scopeOr.push({ entityType: "worker", entityId: linkedEntityId });
      // Also cover where sourceType requests for that worker? Already covered by entityType
    } else if (linkedEntityId) {
      // generic fallback for supervisor linked entity
      scopeOr.push({ entityType: linkedEntityType as string, entityId: linkedEntityId });
    }
    // Customer-management
    scopeOr.push({ sourceType: { $in: ["customers", "orders", "system"] } });
    scopeOr.push({ sourceType: "requests", entityType: { $in: ["customer", "customer_request"] } });
    scopeOr.push({ entityType: "customer" });
    // Own actions (non-chat)
    scopeOr.push({ actorAccountId: accountId, sourceType: { $ne: "chats" } });
    // Also allow own chat actions only if participant already covered, but add explicit for completeness (will be intersected with chatAllowed)
    filters.push({ $or: scopeOr });
  } else {
    // portal users: worker/supplier/customer
    const scopeOr: any[] = [...chatAllowedBranches];
    // Worker: activities where entityType=worker and entityId=linkedEntityId, plus own actions
    // Supplier similar; Customer similar plus orders
    if (linkedEntityType && linkedEntityId) {
      if (role === "worker" && linkedEntityType === "worker") {
        scopeOr.push({ entityType: "worker", entityId: linkedEntityId });
        scopeOr.push({ sourceType: "workers", entityId: linkedEntityId });
        scopeOr.push({ sourceType: "workers", sourceId: linkedEntityId });
      } else if (role === "supplier" && linkedEntityType === "supplier") {
        scopeOr.push({ entityType: "supplier", entityId: linkedEntityId });
        scopeOr.push({ sourceType: "suppliers", entityId: linkedEntityId });
        scopeOr.push({ sourceType: "suppliers", sourceId: linkedEntityId });
      } else if (role === "customer" && linkedEntityType === "customer") {
        scopeOr.push({ entityType: "customer", entityId: linkedEntityId });
        scopeOr.push({ sourceType: "customers", entityId: linkedEntityId });
        // Customer plus orders: orders that belong to this customer
        try {
          const orders: any[] = await CustomerOrderModel.find({ customerId: linkedEntityId }).select("id").lean().catch(() => [] as any[]);
          const orderIds = orders.map((o: any) => o.id);
          if (orderIds.length > 0) {
            scopeOr.push({ entityType: "customer_order", entityId: { $in: orderIds } });
            scopeOr.push({ sourceType: "orders", entityId: { $in: orderIds } });
            scopeOr.push({ sourceType: "orders", sourceId: { $in: orderIds } });
            // Also cover where sourceType orders and entityId is orderId
          } else {
            // No orders yet, but don't add blanket orders
          }
        } catch {}
      } else {
        // generic fallback
        scopeOr.push({ entityType: linkedEntityType, entityId: linkedEntityId });
      }
    }
    // Own actions (non-chat)
    scopeOr.push({ actorAccountId: accountId, sourceType: { $ne: "chats" } });
    filters.push({ $or: scopeOr });
  }

  if (source && source !== "all") {
    filters.push({ sourceType: source });
  }
  if (actor && actor !== "all" && isManager) {
    const esc = actor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filters.push({ actorTag: { $regex: esc, $options: "i" } });
  }
  if (date && date !== "all") {
    const now = Date.now();
    let since: number | null = null;
    if (date === "today") since = now - 24 * 60 * 60 * 1000;
    else if (date === "7days") since = now - 7 * 24 * 60 * 60 * 1000;
    else if (date === "30days") since = now - 30 * 24 * 60 * 60 * 1000;
    if (since) filters.push({ createdAt: { $gte: since } });
  }
  if (search && search.trim()) {
    const esc = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filters.push({
      $or: [
        { title: { $regex: esc, $options: "i" } },
        { details: { $regex: esc, $options: "i" } },
        { action: { $regex: esc, $options: "i" } },
        { actorTag: { $regex: esc, $options: "i" } },
      ],
    });
  }

  const filter = filters.length ? { $and: filters } : {};
  const total = await RvbActivityModel.countDocuments(filter);
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const docs = await RvbActivityModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Math.min(100, Math.max(1, limit))).lean();
  // Redact chat details at serialization layer
  const redacted = docs.map((d: any) => redactChatActivity(d));
  return { activities: redacted, total, page, limit, totalPages: Math.ceil(total / Math.min(100, Math.max(1, limit))) };
}
