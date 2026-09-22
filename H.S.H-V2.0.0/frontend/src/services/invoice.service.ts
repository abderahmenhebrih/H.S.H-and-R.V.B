import { generateId } from "../lib/id";
import { invoiceRepository } from "../repositories/invoice.repository";
import type { Invoice } from "../types/entities/invoice";
import { runDatabaseTransaction } from "./operations/database-transaction";
import { BaseService } from "./base.service";

export class InvoiceService extends BaseService {
  async create(invoice: Invoice): Promise<Invoice> {
    return runDatabaseTransaction(async () => {
      await invoiceRepository.create(invoice);
      return invoice;
    });
  }

  async getById(id: string): Promise<Invoice | undefined> {
    this.assertValidId(id, "Invoice");
    return invoiceRepository.getById(id);
  }

  async getAll(): Promise<Invoice[]> {
    return invoiceRepository.getAll();
  }

  async getBySeller(sellerProfileId: string): Promise<Invoice[]> {
    return invoiceRepository.getBySeller(sellerProfileId);
  }

  async getByStatus(status: string): Promise<Invoice[]> {
    return invoiceRepository.getByStatus(status);
  }

  async update(id: string, changes: Partial<Invoice>): Promise<void> {
    this.assertValidId(id, "Invoice");
    return invoiceRepository.update(id, changes);
  }

  async delete(id: string): Promise<void> {
    this.assertValidId(id, "Invoice");
    return invoiceRepository.delete(id);
  }
}

export const invoiceService = new InvoiceService();
