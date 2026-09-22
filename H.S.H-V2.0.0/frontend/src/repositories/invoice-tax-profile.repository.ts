import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { InvoiceTaxProfile } from "../types/entities/invoice-tax-profile";

export class InvoiceTaxProfileRepository extends BaseRepository<InvoiceTaxProfile> {
  constructor() {
    super(db.invoiceTaxProfiles, "invoiceTaxProfile");
  }

  async getByCode(code: string): Promise<InvoiceTaxProfile | undefined> {
    return this.table.where("code").equals(code).first();
  }
}

export const invoiceTaxProfileRepository = new InvoiceTaxProfileRepository();
