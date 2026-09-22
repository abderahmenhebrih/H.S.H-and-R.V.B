import type { SyncedEntity } from "../core/synced-entity";

export interface Transfer extends SyncedEntity {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: number;
  note?: string;
}
