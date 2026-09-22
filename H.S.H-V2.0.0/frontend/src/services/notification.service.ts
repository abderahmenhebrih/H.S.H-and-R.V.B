import { notificationRepository } from "../repositories/notification.repository";
import type { Notification, NotificationType, NotificationSeverity } from "../types/entities/notification";
import { generateId } from "../lib/id";
import { db } from "../lib/database/db";

function hashStringToHex(str: string): string {
  let h1 = 0x6a09e667;
  let h2 = 0xbb67ae85;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x9e3779b1);
    h2 = Math.imul(h2 ^ ch, 0x85ebca6b);
    h1 = (h1 << 13) | (h1 >>> 19);
    h2 = (h2 << 11) | (h2 >>> 21);
  }
  h1 >>>= 0;
  h2 >>>= 0;
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function deterministicNotificationId(sourceEventId: string): string {
  const hash = hashStringToHex(sourceEventId);
  const sanitized = sourceEventId.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 32);
  // Keep ID safe, deterministic, and globally unique per sourceEventId
  // Use hash prefix to guarantee fixed length + sanitized for debugging
  if (sanitized.length > 0) {
    return `notif_${hash}_${sanitized}`;
  }
  return `notif_${hash}`;
}

export class NotificationService {
  async create(input: {
    type: NotificationType;
    severity: NotificationSeverity;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    route?: string;
    sourceEventId?: string;
    audienceType?: "all" | "role" | "user";
    audienceIds?: string[];
    priority?: "normal" | "high" | "urgent";
    archivedAt?: number | null;
  }): Promise<Notification | null> {
    // Deduplicate by sourceEventId (local fast-path)
    if (input.sourceEventId) {
      const existing = await notificationRepository.findBySourceEventId(input.sourceEventId);
      if (existing) return existing;
    }

    const now = Date.now();
    const deterministicId = input.sourceEventId ? deterministicNotificationId(input.sourceEventId) : null;
    // If deterministic ID already exists locally (same sourceEventId from race), return existing
    if (deterministicId) {
      const existingById = await notificationRepository.getById(deterministicId).catch(() => undefined);
      if (existingById) return existingById;
    }
    const notification: Notification = {
      id: deterministicId ?? generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      route: input.route,
      sourceEventId: input.sourceEventId,
      audienceType: input.audienceType ?? "all",
      audienceIds: input.audienceIds,
      readAt: undefined,
      archivedAt: (input as any).archivedAt ?? null,
      priority: (input as any).priority ?? "normal",
    };

    try {
      await notificationRepository.create(notification);
    } catch (e: any) {
      // If deterministic ID collides (race or already synced), return existing
      if (deterministicId && e?.name === "ConstraintError") {
        const existingById = await notificationRepository.getById(deterministicId).catch(() => undefined);
        if (existingById) return existingById;
      }
      throw e;
    }
    return notification;
  }

  async getById(id: string): Promise<Notification | undefined> {
    return notificationRepository.getById(id);
  }

  async getAll(): Promise<Notification[]> {
    const all = await notificationRepository.getAll();
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async getRecent(limit = 8): Promise<Notification[]> {
    return notificationRepository.getRecent(limit);
  }

  async getUnread(): Promise<Notification[]> {
    return notificationRepository.getUnread();
  }

  async getUnreadCount(): Promise<number> {
    return notificationRepository.getUnreadCount();
  }

  async findBySourceEventId(sourceEventId: string): Promise<Notification | undefined> {
    return notificationRepository.findBySourceEventId(sourceEventId);
  }

  async markAsRead(id: string): Promise<void> {
    const existing = await notificationRepository.getById(id);
    if (!existing || existing.readAt) return;
    await notificationRepository.update(id, { readAt: Date.now(), updatedAt: Date.now() } as any);
    try { window.dispatchEvent(new CustomEvent("hebrih-notifications-changed")); } catch {}
  }

  async markAsUnread(id: string): Promise<void> {
    const existing = await notificationRepository.getById(id);
    if (!existing || !existing.readAt) return;
    await notificationRepository.update(id, { readAt: undefined as any, updatedAt: Date.now() } as any);
    try { window.dispatchEvent(new CustomEvent("hebrih-notifications-changed")); } catch {}
  }

  async archive(id: string): Promise<void> {
    const existing = await notificationRepository.getById(id);
    if (!existing || (existing as any).archivedAt) return;
    await notificationRepository.update(id, { archivedAt: Date.now(), updatedAt: Date.now() } as any);
    try { window.dispatchEvent(new CustomEvent("hebrih-notifications-changed")); } catch {}
  }

  async restore(id: string): Promise<void> {
    const existing = await notificationRepository.getById(id);
    if (!existing || !(existing as any).archivedAt) return;
    await notificationRepository.update(id, { archivedAt: null as any, updatedAt: Date.now() } as any);
    try { window.dispatchEvent(new CustomEvent("hebrih-notifications-changed")); } catch {}
  }

  async markAllAsRead(): Promise<void> {
    const unread = await this.getUnread();
    for (const n of unread) {
      await this.markAsRead(n.id);
    }
    try { window.dispatchEvent(new CustomEvent("hebrih-notifications-changed")); } catch {}
  }

  async bulkAction(ids: string[], action: "read" | "unread" | "archive" | "restore"): Promise<void> {
    for (const id of ids) {
      if (action === "read") await this.markAsRead(id);
      else if (action === "unread") await this.markAsUnread(id);
      else if (action === "archive") await this.archive(id);
      else if (action === "restore") await this.restore(id);
    }
  }

  async deleteNotification(id: string): Promise<void> {
    await notificationRepository.delete(id);
    try { window.dispatchEvent(new CustomEvent("hebrih-notifications-changed")); } catch {}
  }

  async getFiltered(filter: { type?: string; unreadOnly?: boolean; search?: string }): Promise<Notification[]> {
    let all = await this.getAll();
    // Exclude archived by default for legacy callers
    all = all.filter((n) => !(n as any).archivedAt);
    if (filter.unreadOnly) all = all.filter((n) => !n.readAt);
    if (filter.type && filter.type !== "all") {
      if (filter.type === "financial") {
        const financial = ["payment", "purchase", "sale", "expense", "transfer", "account"];
        all = all.filter((n) => financial.includes(n.type));
      } else if (filter.type === "orders") {
        all = all.filter((n) => n.type === "customer_order");
      } else {
        all = all.filter((n) => n.type === filter.type);
      }
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      all = all.filter((n) => `${n.title} ${n.message}`.toLowerCase().includes(q));
    }
    return all;
  }

  async getFilteredAdvanced(filter: {
    status?: "all" | "unread" | "read" | "archived";
    source?: string;
    priority?: string;
    date?: string;
    search?: string;
  }): Promise<Notification[]> {
    let all = await this.getAll();
    const status = filter.status || "all";
    if (status === "archived") all = all.filter((n) => !!(n as any).archivedAt);
    else if (status === "unread") all = all.filter((n) => !n.readAt && !(n as any).archivedAt);
    else if (status === "read") all = all.filter((n) => !!n.readAt && !(n as any).archivedAt);
    else all = all.filter((n) => !(n as any).archivedAt);

    if (filter.source && filter.source !== "all") {
      const src = filter.source;
      const map: Record<string, string[]> = {
        chats: ["system"],
        requests: ["worker", "purchase"],
        orders: ["customer_order"],
        accounts: ["account"],
        workers: ["worker"],
        suppliers: ["purchase"],
        customers: ["customer_order"],
        system: ["system", "sync"],
      };
      const types = map[src];
      if (types) {
        all = all.filter((n) => types.includes(n.type) || (n.route || "").toLowerCase().includes(src) || (n.entityType || "").toLowerCase().includes(src));
      }
    }
    if (filter.priority && filter.priority !== "all") {
      all = all.filter((n) => ((n as any).priority || "normal") === filter.priority);
    }
    if (filter.date && filter.date !== "all") {
      const now = Date.now();
      let since: number | null = null;
      if (filter.date === "today") since = now - 86400000;
      else if (filter.date === "7days") since = now - 7 * 86400000;
      else if (filter.date === "30days") since = now - 30 * 86400000;
      if (since) all = all.filter((n) => n.createdAt >= since!);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      all = all.filter((n) => `${n.title} ${n.message} ${n.entityId || ""}`.toLowerCase().includes(q));
    }
    return all;
  }
}

export const notificationService = new NotificationService();
