import type { SyncedEntity } from "../core/synced-entity";

export interface Supplier extends SyncedEntity {
  name: string;
  phone: string;
  address?: string;
  identificationNumber?: string;
  email?: string;
  notes?: string;
  balance: number;
}
