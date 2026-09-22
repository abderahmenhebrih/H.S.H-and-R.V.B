import type { SyncedEntity } from "../core/synced-entity";

export type OfficeFileType = "document" | "spreadsheet";
export type OfficeFileTemplateId = string;

export interface OfficeLinkedEntity {
  entityType: "customer" | "supplier" | "worker" | "product" | "sale" | "purchase" | "payment" | "invoice" | "vehicle" | "task";
  entityId: string;
  labelSnapshot: string;
}

export interface OfficeFile extends SyncedEntity {
  id: string;
  type: OfficeFileType;
  title: string;
  description?: string;
  content: unknown; // Document JSON (Tiptap) or Workbook JSON (Univer)
  contentVersion?: number;
  tags?: string[];
  linkedEntities?: OfficeLinkedEntity[];
  // Templates: which template was used to create this file
  templateId?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  deletedAt?: number;
  lastOpenedAt?: number;
  createdBy?: string;
}
