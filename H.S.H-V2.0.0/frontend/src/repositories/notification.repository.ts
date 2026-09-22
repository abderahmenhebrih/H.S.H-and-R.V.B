import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Notification } from "../types/entities/notification";

export class NotificationRepository extends BaseRepository<Notification> {
  constructor() {
    super(db.notifications, "notification");
  }

  async getBySourceEventId(sourceEventId: string): Promise<Notification | undefined> {
    return this.table.where("sourceEventId").equals(sourceEventId).first();
  }

  async getUnread(): Promise<Notification[]> {
    return this.table.where("readAt").equals(undefined as any).toArray().catch(async () => {
      const all = await this.table.toArray();
      return all.filter((n) => !n.readAt);
    });
  }

  async getRecent(limit = 20): Promise<Notification[]> {
    const all = await this.table.toArray();
    return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  async getUnreadCount(): Promise<number> {
    const all = await this.table.toArray();
    return all.filter((n) => !n.readAt).length;
  }

  async findBySourceEventId(sourceEventId: string): Promise<Notification | undefined> {
    return this.getBySourceEventId(sourceEventId);
  }
}

export const notificationRepository = new NotificationRepository();
