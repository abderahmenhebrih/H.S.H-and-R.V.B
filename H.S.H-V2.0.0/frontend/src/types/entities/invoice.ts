import type { SyncedEntity } from "../core/synced-entity";

export type InvoiceStatus = "DRAFT" | "ISSUED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type DiscountType = "percentage" | "fixed" | "none";

export interface InvoiceSellerSnapshot {
  commercialName: string;
  legalDenomination?: string;
  legalForm?: string;
  activity?: string;
  address?: string;
  city?: string;
  wilaya?: string;
  phone?: string;
  email?: string;
  fax?: string;
  rc?: string;
  nif?: string;
  nis?: string;
  capital?: string;
  bankName?: string;
  bankAccount?: string;
  rib?: string;
  logo?: string;
  stampImage?: string;
}

export interface InvoiceCustomerSnapshot {
  name: string;
  legalName?: string;
  commercialName?: string;
  legalForm?: string;
  activity?: string;
  address?: string;
  phone?: string;
  email?: string;
  rc?: string;
  nif?: string;
  nis?: string;
}

export interface InvoiceLine {
  productId?: string;
  description: string;
  quantity: number;
  weightKg: number;
  unit?: string;
  unitPriceHT: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount?: number;
  totalHT: number;
  taxProfileId?: string;
  taxRate: number;
  taxAmount: number;
  otherTaxRate?: number;
  otherTaxAmount?: number;
  totalTTC: number;
}

export interface InvoiceAdditionalCharge {
  label: string;
  amount: number;
  taxProfileId?: string;
  taxRate?: number;
  taxAmount?: number;
  total: number;
}

export interface Invoice extends SyncedEntity {
  id: string;
  status: InvoiceStatus;
  sellerProfileId: string;
  invoiceNumber?: string;
  sequenceNumber?: number;
  sellerSnapshot: InvoiceSellerSnapshot;
  customerSnapshot: InvoiceCustomerSnapshot;
  customerId: string;
  sourceSaleIds: string[];
  invoiceDate: number;
  dueDate?: number;
  paymentMethod?: string;
  paymentMethodId?: string;
  paymentMethodLabel?: string;
  lines: InvoiceLine[];
  subtotalHT: number;
  discountTotal: number;
  additionalCharges?: InvoiceAdditionalCharge[];
  additionalChargesTotal?: number;
  taxableBase: number;
  taxTotal: number;
  otherTaxTotal: number;
  totalTTC: number;
  amountInWords?: string;
  currencyCode: string;
  documentLanguage: "en" | "fr" | "ar";
  notes?: string;
  cancelledAt?: number;
  cancellationReason?: string;
  issuedAt?: number;
  paymentStatus?: PaymentStatus;
  documentDefaultsSnapshot?: {
    showBankDetails: boolean;
    showRC: boolean;
    showNIF: boolean;
    showNIS: boolean;
    showCapital: boolean;
    showStamp: boolean;
  };
}
