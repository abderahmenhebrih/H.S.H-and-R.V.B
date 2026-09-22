import type { SyncedEntity } from "../core/synced-entity";

export interface InvoiceTaxProfile extends SyncedEntity {
  id: string;
  name: string;
  code: string;
  vatRate: number;
  otherTaxRate?: number;
  otherTaxLabel?: string;
  enabled: boolean;
}
