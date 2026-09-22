import { v4 as uuidv4 } from "uuid";
import { RvbActivityModel } from "../models/rvb-activity.model";

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

export async function recordActivity(input: CreateActivityInput) {
  const now = Date.now();
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
    details: input.details || null,
  } as any);
  return doc.toObject();
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

  const filters: any[] = [];

  // Scope filtering: manager/admin see all, supervisor sees customers/system+own, portal users see own only
  if (!isManager) {
    if (isSupervisor) {
      filters.push({
        $or: [
          { actorAccountId: accountId },
          { sourceType: { $in: ["customers", "orders", "system"] } },
          { sourceType: "requests", entityType: { $in: ["customer", "customer_request"] } },
          { entityType: "customer" },
          { sourceType: "chats" }, // chats visible if participant? We allow all chat activities for supervisor? Simplify: allow chats where actor is self or system
        ],
      });
    } else {
      // worker/supplier/customer: own only
      filters.push({ actorAccountId: accountId });
    }
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
  return { activities: docs, total, page, limit, totalPages: Math.ceil(total / Math.min(100, Math.max(1, limit))) };
}
