import type { SyncedEntity } from "../core/synced-entity";

export type BankAccountType = "cash" | "bank";

export interface BankAccount extends SyncedEntity {
  type: BankAccountType;
  name: string;
  initialBalance: number;
  balance: number;
  notes?: string;
}
