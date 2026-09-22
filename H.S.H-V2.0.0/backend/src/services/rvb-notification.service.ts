import { v4 as uuidv4 } from "uuid";
import { NotificationModel } from "../models/notification.model";
import { RvbNotificationRecipientModel } from "../models/rvb-notification-recipient.model";
import { RvbAccountModel } from "../models/rvb-account.model";
import { getIO } from "../lib/chat-socket";

export type RvbNotificationPriority = "normal" | "high" | "urgent";
export type RvbPreferenceCategory = "chats" | "mentions" | "requests" | "orders" | "statusUpdates" | "reminders" | "system";

function derivePriority(input: {
  type: string;
  severity: string;
  sourceType?: string;
  title?: string;
  priority?: RvbNotificationPriority;
}): RvbNotificationPriority {
  if (input.priority) return input.priority;
  const urgentKeywords = ["urgent", "security", "disabled", "archived"];
  const highKeywords = ["payment", "loan", "supply", "shipment", "order", "mention", "reminder", "request"];
  const hay = `${input.type} ${input.title || ""} ${input.sourceType || ""}`.toLowerCase();
  if (urgentKeywords.some((k) => hay.includes(k)) && input.severity === "critical") return "urgent";
  if (highKeywords.some((k) => hay.includes(k))) {
    if (input.severity === "critical" || input.severity === "warning") return "high";
    if (["worker", "purchase", "customer_order", "payment"].includes(input.type)) return "high";
  }
  return "normal";
}

function deriveCategory(input: { type: string; title?: string; message?: string; isMention?: boolean; isReply?: boolean; isReminder?: boolean }): RvbPreferenceCategory {
  if (input.isReminder) return "reminders";
  if (input.isMention || input.isReply) return "mentions";
  if (["worker", "purchase"].includes(input.type)) return "requests";
  if (["customer_order", "sale", "payment"].includes(input.type) && input.title?.toLowerCase().includes("order")) return "orders";
  if (["customer_order"].includes(input.type)) return "requests";
  if (input.type === "system" && input.title?.toLowerCase().includes("chat")) return "chats";
  if (input.type === "system") return "system";
  if (input.type === "account") return "statusUpdates";
  return "statusUpdates";
}

export function getAudienceVisibleFilter(accountId: string, role: string): any {
  return {
    $or: [
      { audienceType: "all" },
      { audienceType: "role", audienceIds: role },
      { audienceType: "user", audienceIds: accountId },
      { audienceType: { $exists: false } },
      { audienceType: null },
    ],
  };
}

async function resolveRecipients(input: { audienceType: "all" | "role" | "user"; audienceIds?: string[] }): Promise<string[]> {
  if (input.audienceType === "user" && input.audienceIds?.length) {
    const docs = await RvbAccountModel.find({ id: { $in: input.audienceIds }, status: "active" }).lean();
    return docs.map((d: any) => d.id);
  }
  if (input.audienceType === "role" && input.audienceIds?.length) {
    const docs = await RvbAccountModel.find({ role: { $in: input.audienceIds as any }, status: "active" }).lean();
    return docs.map((d: any) => d.id);
  }
  if (input.audienceType === "all") {
    const docs = await RvbAccountModel.find({ status: "active" }).lean();
    return docs.map((d: any) => d.id);
  }
  return [];
}

async function shouldDeliverToAccount(accountId: string, category: RvbPreferenceCategory, mandatory: boolean): Promise<boolean> {
  if (mandatory) return true;
  const acc: any = await RvbAccountModel.findOne({ id: accountId }).lean();
  const prefs = acc?.preferences?.notifications;
  if (!prefs) return true;
  // Map category to pref key
  const keyMap: Record<string, string> = {
    chats: "chats",
    mentions: "mentions",
    requests: "requests",
    orders: "orders",
    statusUpdates: "statusUpdates",
    reminders: "reminders",
    system: "statusUpdates",
  };
  const key = keyMap[category] || "statusUpdates";
  if (prefs[key] === false) return false;
  return true;
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
  category?: RvbPreferenceCategory;
  mandatory?: boolean;
  isMention?: boolean;
  isReply?: boolean;
  isReminder?: boolean;
}): Promise<any | null> {
  const existing = await NotificationModel.findOne({ sourceEventId: input.sourceEventId }).lean();
  if (existing) return existing;
  const now = Date.now();
  const priority = derivePriority({ type: input.type, severity: input.severity, title: input.title, priority: input.priority });
  const category = input.category || deriveCategory({ type: input.type, title: input.title, message: input.message, isMention: input.isMention, isReply: input.isReply, isReminder: input.isReminder });
  const mandatory = !!input.mandatory;
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
      category,
      mandatory,
    } as any);

    // Resolve recipients and create per-recipient state
    const recipientIds = await resolveRecipients({ audienceType: input.audienceType, audienceIds: input.audienceIds });
    const delivered: string[] = [];
    const bulkOps: any[] = [];
    for (const accountId of recipientIds) {
      const should = await shouldDeliverToAccount(accountId, category as RvbPreferenceCategory, mandatory);
      if (!should) {
        // Create suppressed recipient so we don't re-attempt, but mark suppressed
        bulkOps.push({
          updateOne: {
            filter: { notificationId: doc.id, accountId },
            update: {
              $setOnInsert: {
                id: `rnr-${uuidv4()}`,
                notificationId: doc.id,
                accountId,
                readAt: null,
                archivedAt: null,
                deliveredAt: null,
                suppressedAt: now,
                suppressionReason: `preference:${category}`,
                createdAt: now,
                updatedAt: now,
              },
            },
            upsert: true,
          },
        });
        continue;
      }
      bulkOps.push({
        updateOne: {
          filter: { notificationId: doc.id, accountId },
          update: {
            $setOnInsert: {
              id: `rnr-${uuidv4()}`,
              notificationId: doc.id,
              accountId,
              readAt: null,
              archivedAt: null,
              deliveredAt: now,
              createdAt: now,
              updatedAt: now,
            },
          },
          upsert: true,
        },
      });
      delivered.push(accountId);
    }
    if (bulkOps.length) {
      await RvbNotificationRecipientModel.bulkWrite(bulkOps as any);
    }

    // Realtime emit only to delivered recipients
    try {
      const io = getIO();
      if (io && delivered.length) {
        for (const uid of delivered) {
          io.to(`user:${uid}`).emit("rvb:notification", { notification: doc });
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

// Backfill helper for legacy notifications: ensure recipient exists for current account
async function ensureRecipientsForAccount(accountId: string, role: string) {
  const audienceFilter = getAudienceVisibleFilter(accountId, role);
  const baseNotifications = await NotificationModel.find(audienceFilter as any).lean();
  const ops: any[] = [];
  const now = Date.now();
  for (const n of baseNotifications as any[]) {
    const exists = await RvbNotificationRecipientModel.findOne({ notificationId: n.id, accountId }).lean();
    if (exists) continue;
    // For legacy group notifications with shared readAt, do not seed as read
    ops.push({
      updateOne: {
        filter: { notificationId: n.id, accountId },
        update: {
          $setOnInsert: {
            id: `rnr-${uuidv4()}`,
            notificationId: n.id,
            accountId,
            readAt: null,
            archivedAt: null,
            deliveredAt: now,
            createdAt: n.createdAt,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    });
    if (ops.length >= 500) {
      await RvbNotificationRecipientModel.bulkWrite(ops as any);
      ops.length = 0;
    }
  }
  if (ops.length) await RvbNotificationRecipientModel.bulkWrite(ops as any);
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
  // Ensure legacy recipients exist lazily (first page only to limit)
  await ensureRecipientsForAccount(accountId, role).catch(() => {});

  // Build recipient status filter
  const recipientFilter: any = { accountId };
  if (status === "archived") recipientFilter.archivedAt = { $ne: null };
  else if (status === "unread") {
    recipientFilter.readAt = null;
    recipientFilter.archivedAt = null;
  } else if (status === "read") {
    recipientFilter.readAt = { $ne: null };
    recipientFilter.archivedAt = null;
  } else {
    recipientFilter.archivedAt = null;
  }

  // Find recipient notificationIds for this account matching status
  const recipients = await RvbNotificationRecipientModel.find(recipientFilter as any).lean();
  const notificationIds = recipients.map((r: any) => r.notificationId);
  if (notificationIds.length === 0) {
    return { notifications: [], total: 0, page, limit, totalPages: 0, unreadCount: 0, archivedCount: 0 };
  }

  const andFilters: any[] = [{ id: { $in: notificationIds } }];

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
  const docs = await NotificationModel.find(filter as any)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Math.min(100, Math.max(1, limit)))
    .lean();

  // Merge recipient state
  const recipientMap = new Map(recipients.map((r: any) => [r.notificationId, r]));
  const merged = docs.map((d: any) => {
    const rec: any = recipientMap.get(d.id);
    return {
      ...d,
      readAt: rec?.readAt ?? null,
      archivedAt: rec?.archivedAt ?? null,
      recipientId: rec?.id,
      deliveredAt: rec?.deliveredAt,
    };
  });
  // Sort already by createdAt, but ensure
  merged.sort((a: any, b: any) => b.createdAt - a.createdAt);

  const unreadCount = await RvbNotificationRecipientModel.countDocuments({ accountId, readAt: null, archivedAt: null } as any);
  const archivedCount = await RvbNotificationRecipientModel.countDocuments({ accountId, archivedAt: { $ne: null } } as any);
  return { notifications: merged, total, page, limit, totalPages: Math.ceil(total / Math.min(100, Math.max(1, limit))), unreadCount, archivedCount };
}

export async function markNotificationRead(notificationId: string, accountId: string, role: string, unread: boolean) {
  // Verify recipient exists and is visible (via audience check if legacy)
  let recipient: any = await RvbNotificationRecipientModel.findOne({ notificationId, accountId });
  if (!recipient) {
    // Try to backfill legacy: check if base notification is visible to this account
    const base: any = await NotificationModel.findOne({ id: notificationId }).lean();
    if (!base) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND", status: 404 });
    const isVisible = await NotificationModel.findOne({ id: notificationId, $and: [getAudienceVisibleFilter(accountId, role)] } as any).lean();
    if (!isVisible) throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN", status: 403 });
    // Create recipient lazily
    recipient = await RvbNotificationRecipientModel.findOneAndUpdate(
      { notificationId, accountId },
      {
        $setOnInsert: {
          id: `rnr-${uuidv4()}`,
          notificationId,
          accountId,
          readAt: null,
          archivedAt: null,
          deliveredAt: Date.now(),
          createdAt: base.createdAt,
          updatedAt: Date.now(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  if (recipient.archivedAt) throw Object.assign(new Error("ARCHIVED"), { code: "ARCHIVED", status: 400 });
  recipient.readAt = unread ? null : Date.now();
  recipient.updatedAt = Date.now();
  await recipient.save();
  const base: any = await NotificationModel.findOne({ id: notificationId }).lean();
  return { ...base, readAt: recipient.readAt, archivedAt: recipient.archivedAt };
}

export async function archiveNotification(notificationId: string, accountId: string, role: string, arch: boolean) {
  let recipient: any = await RvbNotificationRecipientModel.findOne({ notificationId, accountId });
  if (!recipient) {
    const base: any = await NotificationModel.findOne({ id: notificationId }).lean();
    if (!base) throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND", status: 404 });
    const isVisible = await NotificationModel.findOne({ id: notificationId, $and: [getAudienceVisibleFilter(accountId, role)] } as any).lean();
    if (!isVisible) throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN", status: 403 });
    recipient = await RvbNotificationRecipientModel.findOneAndUpdate(
      { notificationId, accountId },
      {
        $setOnInsert: {
          id: `rnr-${uuidv4()}`,
          notificationId,
          accountId,
          readAt: null,
          archivedAt: null,
          deliveredAt: Date.now(),
          createdAt: base.createdAt,
          updatedAt: Date.now(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  recipient.archivedAt = arch ? Date.now() : null;
  recipient.updatedAt = Date.now();
  await recipient.save();
  const base: any = await NotificationModel.findOne({ id: notificationId }).lean();
  return { ...base, readAt: recipient.readAt, archivedAt: recipient.archivedAt };
}

export async function markAllRead(accountId: string, role: string) {
  const now = Date.now();
  const res = await RvbNotificationRecipientModel.updateMany(
    { accountId, readAt: null, archivedAt: null } as any,
    { $set: { readAt: now, updatedAt: now } } as any,
  );
  return { modified: (res as any).modifiedCount ?? 0 };
}

export async function bulkUpdate(accountId: string, role: string, ids: string[], action: "read" | "unread" | "archive" | "restore") {
  if (!Array.isArray(ids) || ids.length === 0) throw Object.assign(new Error("IDS_REQUIRED"), { code: "IDS_REQUIRED", status: 400 });
  if (ids.length > 100) throw Object.assign(new Error("TOO_MANY"), { code: "TOO_MANY", status: 400 });
  // Verify each id has a recipient for this account (or is visible legacy)
  const existingRecipients = await RvbNotificationRecipientModel.find({ notificationId: { $in: ids }, accountId } as any).lean();
  const existingSet = new Set(existingRecipients.map((r: any) => r.notificationId));
  // For ids without recipient, check visibility and create if needed, else forbid
  const missing = ids.filter((id) => !existingSet.has(id));
  for (const mid of missing) {
    const base: any = await NotificationModel.findOne({ id: mid }).lean();
    if (!base) throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN", status: 403 });
    const isVisible = await NotificationModel.findOne({ id: mid, $and: [getAudienceVisibleFilter(accountId, role)] } as any).lean();
    if (!isVisible) throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN", status: 403 });
    // Create recipient for missing
    await RvbNotificationRecipientModel.updateOne(
      { notificationId: mid, accountId },
      {
        $setOnInsert: {
          id: `rnr-${uuidv4()}`,
          notificationId: mid,
          accountId,
          readAt: null,
          archivedAt: null,
          deliveredAt: Date.now(),
          createdAt: base.createdAt,
          updatedAt: Date.now(),
        },
      },
      { upsert: true },
    );
  }
  const now = Date.now();
  if (action === "read") await RvbNotificationRecipientModel.updateMany({ notificationId: { $in: ids }, accountId } as any, { $set: { readAt: now, updatedAt: now } } as any);
  else if (action === "unread") await RvbNotificationRecipientModel.updateMany({ notificationId: { $in: ids }, accountId } as any, { $set: { readAt: null, updatedAt: now } } as any);
  else if (action === "archive") await RvbNotificationRecipientModel.updateMany({ notificationId: { $in: ids }, accountId } as any, { $set: { archivedAt: now, updatedAt: now } } as any);
  else if (action === "restore") await RvbNotificationRecipientModel.updateMany({ notificationId: { $in: ids }, accountId } as any, { $set: { archivedAt: null, updatedAt: now } } as any);
  return { updated: ids.length };
}
