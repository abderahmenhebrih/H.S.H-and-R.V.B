import type { SyncedEntity } from "../core/synced-entity";
import type { PurchaseCalculation } from "./purchase-calculation";

export interface PurchaseItem {
  productId: string;
  quantity: number;
  weightKg: number;
  price: number;
  total: number;
}

export interface Purchase extends SyncedEntity {
  supplierId: string;
  date: number;
  items: PurchaseItem[];
  total: number;
  calculation?: PurchaseCalculation;
}
