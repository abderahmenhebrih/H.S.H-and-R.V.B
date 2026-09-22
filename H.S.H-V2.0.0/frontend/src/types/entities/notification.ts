import type { SyncedEntity } from "../core/synced-entity";

export type NotificationType =
  | "customer_order"
  | "task"
  | "payment"
  | "purchase"
  | "sale"
  | "expense"
  | "transfer"
  | "worker"
  | "vehicle"
  | "inventory"
  | "account"
  | "sync"
  | "system";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export interface Notification extends SyncedEntity {
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
  readAt?: number;
}
