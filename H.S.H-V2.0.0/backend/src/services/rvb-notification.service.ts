import { v4 as uuidv4 } from "uuid";
import { NotificationModel } from "../models/notification.model";
import { getIO } from "../lib/chat-socket";

export type RvbNotificationPriority = "normal" | "high" | "urgent";
export type RvbNotificationSource = "chats" | "requests" | "orders" | "accounts" | "workers" | "suppliers" | "customers" | "system";

function derivePriority(input: {
  type: string;
  severity: string;
  sourceType?: string;
  title?: string;
  priority?: RvbNotificationPriority;
}): RvbNotificationPriority {
  if (input.priority) return input.priority;
  // High/urgent examples: payment/loan requests, supply/shipment awaits review, order awaits review, direct mention, reminder, account security
  const urgentKeywords = ["urgent", "security", "disabled", "archived"];
  const highKeywords = ["payment", "loan", "supply", "shipment", "order", "mention", "reminder", "request"];
  const hay = `${input.type} ${input.title || ""} ${input.sourceType || ""}`.toLowerCase();
  if (urgentKeywords.some((k) => hay.includes(k)) && input.severity === "critical") return "urgent";
  if (highKeywords.some((k) => hay.includes(k))) {
    if (input.severity === "critical" || input.severity === "warning") return "high";
    // default high for request-like types
    if (["worker", "purchase", "customer_order", "payment"].includes(input.type)) return "high";
  }
  // chat normal, system normal
  return "normal";
}

export function getAudienceVisibleFilter(accountId: string, role: string): any {
  return {
    $or: [
      { audienceType: "all" },
      { audienceType: "role", audienceIds: role },
      { audienceType: "user", audienceIds: accountId },
      // legacy fallback where audienceType missing = visible
      { audienceType: { $exists: false } },
      { audienceType: null },
    ],
  };
}

export async function createRvbNotification(input: {
  type: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  route?: string;
  sourceEventId: string;
  audienceType: "all" | "role" | "user";
  audienceIds?: string[];
  priority?: RvbNotificationPriority;
}): Promise<any | null> {
  const existing = await NotificationModel.findOne({ sourceEventId: input.sourceEventId }).lean();
  if (existing) return existing;
  const now = Date.now();
  const priority = derivePriority({ type: input.type, severity: input.severity, title: input.title, priority: input.priority });
  try {
    const doc = await NotificationModel.create({
      id: `notif-${uuidv4()}`,
      createdAt: now,
      updatedAt: now,
      syncStatus: "synced",
      type: input.type as any,
      severity: input.severity as any,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      route: input.route,
      sourceEventId: input.sourceEventId,
      audienceType: input.audienceType,
      audienceIds: input.audienceIds || [],
      readAt: null,
      archivedAt: null,
      priority,
    } as any);
    // realtime emit
    try {
      const io = getIO();
      if (io) {
        if (input.audienceType === "user" && input.audienceIds?.length) {
          for (const uid of input.audienceIds) io.to(`user:${uid}`).emit("rvb:notification", { notification: doc });
        } else if (input.audienceType === "role" && input.audienceIds?.length) {
          for (const r of input.audienceIds) io.to(`role:${r}`).emit("rvb:notification", { notification: doc });
          // also emit to user rooms is not needed if frontend joins role rooms
        } else {
          io.emit("rvb:notification", { notification: doc });
        }
      }
    } catch {}
    return doc;
  } catch (e: any) {
    if (e?.code === 11000) {
      const dup = await NotificationModel.findOne({ sourceEventId: input.sourceEventId }).lean();
      return dup || null;
    }
    throw e;
  }
}

export async function listNotificationsForUser(params: {
  accountId: string;
  role: string;
  status?: "all" | "unread" | "read" | "archived";
  source?: string;
  priority?: string;
  date?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { accountId, role, status = "all", source, priority, date, search, page = 1, limit = 25 } = params;
  const audienceFilter = getAudienceVisibleFilter(accountId, role);
  const andFilters: any[] = [audienceFilter];

  // status
  if (status === "archived") {
    andFilters.push({ archivedAt: { $ne: null } });
  } else if (status === "unread") {
    andFilters.push({ readAt: null, $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] });
  } else if (status === "read") {
    andFilters.push({ readAt: { $ne: null }, $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] });
  } else {
    // all = not archived
    andFilters.push({ $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] });
  }

  // source / type mapping
  if (source && source !== "all") {
    const sourceMap: Record<string, string[]> = {
      chats: ["system"],
      requests: ["worker", "purchase", "customer_order"],
      orders: ["customer_order"],
      accounts: ["account"],
      workers: ["worker"],
      suppliers: ["purchase"],
      customers: ["customer_order"],
      system: ["system", "sync"],
    };
    // For precise source filter we use entityType/route heuristics also
    // Simplify: match type OR route/entityType contains source
    const types = sourceMap[source];
    if (types) {
      andFilters.push({
        $or: [
          { type: { $in: types } },
          { route: new RegExp(source, "i") },
          { entityType: new RegExp(source, "i") },
        ],
      });
    }
  }

  if (priority && priority !== "all") {
    andFilters.push({ priority });
  }

  if (date && date !== "all") {
    const now = Date.now();
    let since: number | null = null;
    if (date === "today") since = now - 24 * 60 * 60 * 1000;
    else if (date === "7days") since = now - 7 * 24 * 60 * 60 * 1000;
    else if (date === "30days") since = now - 30 * 24 * 60 * 60 * 1000;
    if (since) andFilters.push({ createdAt: { $gte: since } });
  }

  if (search && search.trim()) {
    const q = search.trim();
    // Escape regex
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    andFilters.push({
      $or: [
        { title: { $regex: esc, $options: "i" } },
        { message: { $regex: esc, $options: "i" } },
        { entityId: { $regex: esc, $options: "i" } },
      ],
    });
  }

  const filter: any = andFilters.length ? { $and: andFilters } : {};
  const total = await NotificationModel.countDocuments(filter as any);
  const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit));
  const docs = await NotificationModel.find(filter as any).sort({ createdAt: -1 }).skip(skip).limit(Math.min(100, Math.max(1, limit))).lean();
  const unreadCount = await NotificationModel.countDocuments({ $and: [audienceFilter, { readAt: null }, { $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] }] } as any);
  const archivedCount = await NotificationModel.countDocuments({ $and: [audienceFilter, { archivedAt: { $ne: null } }] } as any);
  return { notifications: docs, total, page, limit, totalPages: Math.ceil(total / Math.min(100, Math.max(1, limit))), unreadCount, archivedCount };
}

export async function markNotificationRead(notificationId: string, accountId: string, role: string, unread: boolean) {
  const doc: any = await NotificationModel.findOne({ id: notificationId });
  if (!doc) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND", status: 404 });
  const isVisible = await NotificationModel.findOne({ id: notificationId, $and: [getAudienceVisibleFilter(accountId, role)] } as any).lean();
  if (!isVisible) throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN", status: 403 });
  if (doc.archivedAt) throw Object.assign(new Error("ARCHIVED"), { code: "ARCHIVED", status: 400 });
  if (unread) {
    doc.readAt = null;
  } else {
    doc.readAt = Date.now();
  }
  doc.updatedAt = Date.now();
  await doc.save();
  return doc.toObject();
}

export async function archiveNotification(notificationId: string, accountId: string, role: string, arch: boolean) {
  const doc: any = await NotificationModel.findOne({ id: notificationId });
  if (!doc) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND", status: 404 });
  const isVisible = await NotificationModel.findOne({ id: notificationId, $and: [getAudienceVisibleFilter(accountId, role)] } as any).lean();
  if (!isVisible) throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN", status: 403 });
  doc.archivedAt = arch ? Date.now() : null;
  doc.updatedAt = Date.now();
  await doc.save();
  return doc.toObject();
}

export async function markAllRead(accountId: string, role: string) {
  const filter: any = { $and: [getAudienceVisibleFilter(accountId, role), { readAt: null }, { $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] }] };
  const docs = await NotificationModel.find(filter as any).lean();
  const now = Date.now();
  await NotificationModel.updateMany(filter as any, { $set: { readAt: now, updatedAt: now } } as any);
  return { modified: docs.length };
}

export async function bulkUpdate(accountId: string, role: string, ids: string[], action: "read" | "unread" | "archive" | "restore") {
  if (!Array.isArray(ids) || ids.length === 0) throw Object.assign(new Error("IDS_REQUIRED"), { code: "IDS_REQUIRED", status: 400 });
  if (ids.length > 100) throw Object.assign(new Error("TOO_MANY"), { code: "TOO_MANY", status: 400 });
  // Verify ownership
  const visibleIds = await NotificationModel.find({ id: { $in: ids }, $and: [getAudienceVisibleFilter(accountId, role)] } as any).lean();
  const visibleSet = new Set(visibleIds.map((d: any) => d.id));
  const forbidden = ids.filter((id) => !visibleSet.has(id));
  if (forbidden.length) throw Object.assign(new Error("FORBIDDEN_IDS"), { code: "FORBIDDEN", status: 403, details: forbidden });
  const now = Date.now();
  if (action === "read") await NotificationModel.updateMany({ id: { $in: ids } } as any, { $set: { readAt: now, updatedAt: now } } as any);
  else if (action === "unread") await NotificationModel.updateMany({ id: { $in: ids } } as any, { $set: { readAt: null, updatedAt: now } } as any);
  else if (action === "archive") await NotificationModel.updateMany({ id: { $in: ids } } as any, { $set: { archivedAt: now, updatedAt: now } } as any);
  else if (action === "restore") await NotificationModel.updateMany({ id: { $in: ids } } as any, { $set: { archivedAt: null, updatedAt: now } } as any);
  return { updated: ids.length };
}
