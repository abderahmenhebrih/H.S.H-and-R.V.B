import { generateId } from "../lib/id";
import { incomingInvoiceRepository } from "../repositories/incoming-invoice.repository";
import type { IncomingInvoice } from "../types/entities/incoming-invoice";
import { runDatabaseTransaction } from "./operations/database-transaction";
import { BaseService } from "./base.service";

export class IncomingInvoiceService extends BaseService {
  async create(input: Omit<IncomingInvoice, "id" | "createdAt" | "updatedAt" | "syncStatus">): Promise<IncomingInvoice> {
    return runDatabaseTransaction(async () => {
      const now = Date.now();
      const invoice: IncomingInvoice = {
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
        ...input,
      };
      await incomingInvoiceRepository.create(invoice);
      return invoice;
    });
  }

  async getById(id: string): Promise<IncomingInvoice | undefined> {
    this.assertValidId(id, "IncomingInvoice");
    return incomingInvoiceRepository.getById(id);
  }

  async getAll(): Promise<IncomingInvoice[]> {
    return incomingInvoiceRepository.getAll();
  }

  async delete(id: string): Promise<void> {
    this.assertValidId(id, "IncomingInvoice");
    return incomingInvoiceRepository.delete(id);
  }
}

export const incomingInvoiceService = new IncomingInvoiceService();
