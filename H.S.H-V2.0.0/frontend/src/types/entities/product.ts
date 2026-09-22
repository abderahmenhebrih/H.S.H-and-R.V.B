import type { SyncedEntity } from "../core/synced-entity";

export interface Product extends SyncedEntity {
  name: string;
  price: number;
  quantity: number;
  weightKg: number;
  description?: string;
  taxProfileId?: string;
}
