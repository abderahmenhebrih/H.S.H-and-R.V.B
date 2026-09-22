import type { SyncedEntity } from "../core/synced-entity";

export type PaymentEntityType =
  | "supplier"
  | "customer"
  | "worker"
  | "expense";

export interface Payment extends SyncedEntity {
  entityType: PaymentEntityType;
  entityId: string;
  accountId: string;
  amount: number;
  date: number;
  note?: string;
}
