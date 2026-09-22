import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Purchase } from "../types/entities/purchase";

export class PurchaseRepository extends BaseRepository<Purchase> {
  constructor() {
    super(db.purchases, "purchase");
  }

  async getBySupplierId(supplierId: string): Promise<Purchase[]> {
    return this.table.where("supplierId").equals(supplierId).toArray();
  }

  async getByDateRange(from: number, to: number): Promise<Purchase[]> {
    return this.table
      .where("date")
      .between(from, to, true, true)
      .toArray();
  }
}

export const purchaseRepository = new PurchaseRepository();

