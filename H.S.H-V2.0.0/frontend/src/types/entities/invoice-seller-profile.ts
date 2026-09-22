import type { SyncedEntity } from "../core/synced-entity";

export interface InvoiceSellerProfile extends SyncedEntity {
  id: string;
  enabled: boolean;
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
  invoicePrefix: string;
  nextNumber: number;
  paddingLength: number;
  yearResetPolicy: "never" | "yearly";
  defaultPaymentTerms?: string;
  defaultPaymentMethodId?: string;
  defaultTaxProfileId?: string;
  defaultCurrency?: string;
  lastSequenceYear?: number;
}
