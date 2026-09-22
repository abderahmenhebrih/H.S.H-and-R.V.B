export type SyncOperationType =
  | "create"
  | "update"
  | "delete"
  | "upsert";

export interface SyncRequestOperation {
  operationId: string;
  entity: string;
  entityId: string;
  operation: SyncOperationType;
  payload: unknown;
  createdAt: number;
  baseRevision?: number;
  clientId?: string;
}

export interface SyncRequest {
  operations: SyncRequestOperation[];
  clientId?: string;
}

export interface SyncOperationResult {
  operationId: string;
  entity: string;
  entityId: string;
  operation: SyncOperationType;
  success: boolean;
  message: string;
  revision?: number;
  canonicalEntity?: unknown;
  conflict?: boolean;
  error?: string;
  retryable?: boolean;
}

export interface SyncResponse {
  success: boolean;
  results: SyncOperationResult[];
  currentRevision?: number;
}

export interface SyncChange {
  revision: number;
  entity: string;
  entityId: string;
  operation: SyncOperationType;
  payload?: unknown;
  changedAt: Date;
  sourceClientId?: string;
  operationId?: string;
}

export interface SyncChangesResponse {
  changes: SyncChange[];
  nextRevision: number;
  hasMore: boolean;
  currentRevision: number;
}

export interface BootstrapResponse {
  changes: SyncChange[];
  currentRevision: number;
}
