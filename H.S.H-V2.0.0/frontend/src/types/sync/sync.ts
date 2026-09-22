export type SyncStatus = "synced" | "pending" | "failed";

export interface SyncMetadata {
  syncStatus: SyncStatus;
  lastSyncedAt?: number;
  serverRevision?: number;
}

export interface SyncMetaRecord {
  key: string;
  value: unknown;
}

export interface SyncConflictRecord {
  id?: number;
  entity: string;
  entityId: string;
  operationId: string;
  baseRevision?: number;
  serverRevision: number;
  detectedAt: number;
  resolution: string;
  details?: unknown;
}

export type SyncEntity =
  | "product"
  | "supplier"
  | "customer"
  | "bankAccount"
  | "vehicle"
  | "worker"
  | "expense"
  | "task"
  | "purchase"
  | "sale"
  | "payment"
  | "transfer"
  | "injuryEquation"
  | "settings"
  | "notification"
  | "invoice"
  | "invoiceSellerProfile"
  | "invoiceTaxProfile"
  | "incomingInvoice"
  | "officeFile";
