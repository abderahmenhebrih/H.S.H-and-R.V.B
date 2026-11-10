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
export type NotificationPriority = "normal" | "high" | "urgent";

export interface Notification extends SyncedEntity {
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  /**
   * Optional i18n key for the title, resolved at render time in the viewer's
   * language. Legacy rows (and sync diagnostics) omit it; renderers fall back
   * to `title`. Params carry RAW values (names, amounts); formatting happens
   * at render so locale follows the viewer, never the creator.
   */
  titleKey?: string;
  titleParams?: Record<string, string | number>;
  /** Optional i18n key for structured messages (same fallback rule as title). */
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  entityType?: string;
  entityId?: string;
  route?: string;
  sourceEventId?: string;
  audienceType?: "all" | "role" | "user";
  audienceIds?: string[];
  readAt?: number;
  archivedAt?: number | null;
  priority?: NotificationPriority;
}
