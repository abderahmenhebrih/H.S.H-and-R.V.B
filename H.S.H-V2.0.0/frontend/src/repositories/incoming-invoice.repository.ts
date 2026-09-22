import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { IncomingInvoice } from "../types/entities/incoming-invoice";

export class IncomingInvoiceRepository extends BaseRepository<IncomingInvoice> {
  constructor() {
    super(db.incomingInvoices, "incomingInvoice");
  }

  async getBySupplier(supplierId: string): Promise<IncomingInvoice[]> {
    return this.table.where("supplierId").equals(supplierId).toArray();
  }
}

export const incomingInvoiceRepository = new IncomingInvoiceRepository();
