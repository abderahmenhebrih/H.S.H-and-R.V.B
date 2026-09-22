import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Invoice } from "../types/entities/invoice";

export class InvoiceRepository extends BaseRepository<Invoice> {
  constructor() {
    super(db.invoices, "invoice");
  }

  async getByNumber(sellerProfileId: string, invoiceNumber: string): Promise<Invoice | undefined> {
    return this.table.where("[sellerProfileId+invoiceNumber]").equals([sellerProfileId, invoiceNumber]).first();
  }

  async getBySeller(sellerProfileId: string): Promise<Invoice[]> {
    return this.table.where("sellerProfileId").equals(sellerProfileId).toArray();
  }

  async getByStatus(status: string): Promise<Invoice[]> {
    return this.table.where("status").equals(status).toArray();
  }
}

export const invoiceRepository = new InvoiceRepository();
