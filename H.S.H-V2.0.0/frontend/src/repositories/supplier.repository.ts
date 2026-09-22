import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Supplier } from "../types/entities/supplier";

export class SupplierRepository extends BaseRepository<Supplier> {
  constructor() {
    super(db.suppliers, "supplier");
  }

  async getByName(name: string): Promise<Supplier | undefined> {
    return this.table.where("name").equals(name).first();
  }
}

export const supplierRepository = new SupplierRepository();

