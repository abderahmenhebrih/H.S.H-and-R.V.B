import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Sale } from "../types/entities/sale";

export class SaleRepository extends BaseRepository<Sale> {
  constructor() {
    super(db.sales, "sale");
  }

  async getByCustomerId(customerId: string): Promise<Sale[]> {
    return this.table.where("customerId").equals(customerId).toArray();
  }

  async getByDateRange(from: number, to: number): Promise<Sale[]> {
    return this.table
      .where("date")
      .between(from, to, true, true)
      .toArray();
  }
}

export const saleRepository = new SaleRepository();

