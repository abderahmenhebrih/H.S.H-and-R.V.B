import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { InvoiceSellerProfile } from "../types/entities/invoice-seller-profile";

export class InvoiceSellerProfileRepository extends BaseRepository<InvoiceSellerProfile> {
  constructor() {
    super(db.invoiceSellerProfiles, "invoiceSellerProfile");
  }

  async getByPrefix(prefix: string): Promise<InvoiceSellerProfile | undefined> {
    return this.table.where("invoicePrefix").equals(prefix).first();
  }
}

export const invoiceSellerProfileRepository = new InvoiceSellerProfileRepository();
