import type { SyncedEntity } from "../core/synced-entity";

export interface Expense extends SyncedEntity {
  name: string;
  amount: number;
  accountId: string;
  date: number;
  note?: string;
}
