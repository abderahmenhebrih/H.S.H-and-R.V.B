import type { SyncedEntity } from "../core/synced-entity";

export interface SaleItem {
  productId: string;
  quantity: number;
  weightKg: number;
  price: number;
  total: number;
}

export interface Sale extends SyncedEntity {
  customerId: string;
  date: number;
  items: SaleItem[];
  total: number;
}
