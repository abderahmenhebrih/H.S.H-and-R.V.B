import { generateId } from "../lib/id";
import { incomingInvoiceRepository } from "../repositories/incoming-invoice.repository";
import type { IncomingInvoice } from "../types/entities/incoming-invoice";
import { runDatabaseTransaction } from "./operations/database-transaction";
import { BaseService } from "./base.service";

export class IncomingInvoiceService extends BaseService {
  async create(input: Omit<IncomingInvoice, "id" | "createdAt" | "updatedAt" | "syncStatus">): Promise<IncomingInvoice> {
    return runDatabaseTransaction(async () => {
      if (!input.supplierId || typeof input.supplierId !== "string" || !input.supplierId.trim()) {
        throw new Error("SUPPLIER_NOT_FOUND");
      }
      if (!input.supplierInvoiceNumber || !String(input.supplierInvoiceNumber).trim()) {
        throw new Error("SUPPLIER_INVOICE_NUMBER_REQUIRED");
      }
      const trimmed = String(input.supplierInvoiceNumber).trim();
      const normalized = trimmed.toLowerCase();
      // Case-insensitive duplicate check per supplier (same as backend normalized)
      const existingForSupplier = await incomingInvoiceRepository.getBySupplier(input.supplierId);
      const dup = existingForSupplier.find(
        (inv: any) => String(inv.supplierInvoiceNumber || "").trim().toLowerCase() === normalized,
      );
      if (dup) {
        throw new Error("INCOMING_INVOICE_DUPLICATE: An invoice with this number already exists for this supplier");
      }
      if (!Number.isFinite(input.invoiceDate)) {
        throw new Error("INVOICE_DATE_INVALID");
      }
      const allowed = ["DA", "€", "$"];
      if (input.currencyCode && input.currencyCode.trim() !== "" && !allowed.includes(input.currencyCode.trim())) {
        throw new Error("INVOICE_CURRENCY_INVALID");
      }
      const ht = (input as any).amountHT;
      const ttc = (input as any).amountTTC;
      if (ht !== undefined && ht !== null && (!Number.isFinite(ht) || ht < 0)) throw new Error("INCOMING_AMOUNT_INVALID");
      if (ttc !== undefined && ttc !== null && (!Number.isFinite(ttc) || ttc < 0)) throw new Error("INCOMING_AMOUNT_INVALID");
      if (ht !== undefined && ttc !== undefined && ht !== null && ttc !== null && ttc < ht) throw new Error("INCOMING_AMOUNT_INVALID");
      const tax = (input as any).taxAmount;
      if (tax !== undefined && tax !== null && (!Number.isFinite(tax) || tax < 0)) throw new Error("INCOMING_AMOUNT_INVALID");
      const now = Date.now();
      const invoice: IncomingInvoice = {
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
        ...input,
        supplierInvoiceNumber: trimmed,
      } as any;
      // Also store normalized companion for backend compatibility if model supports it
      (invoice as any).supplierInvoiceNumberNormalized = normalized;
      await incomingInvoiceRepository.create(invoice as any);
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
