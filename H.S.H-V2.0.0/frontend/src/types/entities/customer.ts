import type { SyncedEntity } from "../core/synced-entity";

export interface Customer extends SyncedEntity {
  name: string;
  phone: string;
  address?: string;
  identificationNumber?: string;
  email?: string;
  notes?: string;
  type: string;
  balance: number;
  invoiceCustomerType?: "consumer" | "business";
  legalName?: string;
  commercialName?: string;
  legalForm?: string;
  activity?: string;
  billingAddress?: string;
  rc?: string;
  nif?: string;
  nis?: string;
}
