import type { SyncedEntity } from "../core/synced-entity";

export type IncomingPaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";

export interface IncomingInvoice extends SyncedEntity {
  id: string;
  supplierId: string;
  supplierInvoiceNumber: string;
  invoiceDate: number;
  amountHT: number;
  taxAmount?: number;
  amountTTC: number;
  currencyCode: string;
  purchaseReference?: string;
  paymentStatus?: IncomingPaymentStatus;
  notes?: string;
  attachment?: string;
}
