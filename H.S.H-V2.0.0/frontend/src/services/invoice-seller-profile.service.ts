import { generateId } from "../lib/id";
import { invoiceSellerProfileRepository } from "../repositories/invoice-seller-profile.repository";
import type { InvoiceSellerProfile } from "../types/entities/invoice-seller-profile";
import { runDatabaseTransaction } from "./operations/database-transaction";
import { BaseService } from "./base.service";

export class InvoiceSellerProfileService extends BaseService {
  async create(input: Omit<InvoiceSellerProfile, "id" | "createdAt" | "updatedAt" | "syncStatus">): Promise<InvoiceSellerProfile> {
    return runDatabaseTransaction(async () => {
      const now = Date.now();
      const profile: InvoiceSellerProfile = {
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
        ...input,
      };
      await invoiceSellerProfileRepository.create(profile);
      return profile;
    });
  }

  async getById(id: string): Promise<InvoiceSellerProfile | undefined> {
    this.assertValidId(id, "InvoiceSellerProfile");
    return invoiceSellerProfileRepository.getById(id);
  }

  async getAll(): Promise<InvoiceSellerProfile[]> {
    return invoiceSellerProfileRepository.getAll();
  }

  async update(id: string, updates: Partial<InvoiceSellerProfile>): Promise<void> {
    this.assertValidId(id, "InvoiceSellerProfile");
    await invoiceSellerProfileRepository.update(id, { ...updates, updatedAt: Date.now(), syncStatus: "pending" });
  }
}

export const invoiceSellerProfileService = new InvoiceSellerProfileService();
