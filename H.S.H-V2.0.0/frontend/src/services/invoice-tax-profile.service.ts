import { generateId } from "../lib/id";
import { invoiceTaxProfileRepository } from "../repositories/invoice-tax-profile.repository";
import type { InvoiceTaxProfile } from "../types/entities/invoice-tax-profile";
import { runDatabaseTransaction } from "./operations/database-transaction";
import { BaseService } from "./base.service";

export class InvoiceTaxProfileService extends BaseService {
  async create(input: Omit<InvoiceTaxProfile, "id" | "createdAt" | "updatedAt" | "syncStatus">): Promise<InvoiceTaxProfile> {
    return runDatabaseTransaction(async () => {
      const now = Date.now();
      const profile: InvoiceTaxProfile = {
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
        ...input,
      };
      await invoiceTaxProfileRepository.create(profile);
      return profile;
    });
  }

  async getById(id: string): Promise<InvoiceTaxProfile | undefined> {
    this.assertValidId(id, "InvoiceTaxProfile");
    return invoiceTaxProfileRepository.getById(id);
  }

  async getAll(): Promise<InvoiceTaxProfile[]> {
    return invoiceTaxProfileRepository.getAll();
  }

  async update(id: string, updates: Partial<InvoiceTaxProfile>): Promise<void> {
    this.assertValidId(id, "InvoiceTaxProfile");
    await invoiceTaxProfileRepository.update(id, { ...updates, updatedAt: Date.now(), syncStatus: "pending" });
  }
}

export const invoiceTaxProfileService = new InvoiceTaxProfileService();
