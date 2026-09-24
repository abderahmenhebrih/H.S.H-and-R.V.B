import { generateId } from "../lib/id";
import { officeFileRepository } from "../repositories/office-file.repository";
import type { OfficeFile } from "../types/entities/office-file";
import { runDatabaseTransaction } from "./operations/database-transaction";
import { BaseService } from "./base.service";

const MAX_CONTENT_SIZE = 5 * 1024 * 1024; // 5MB per file

function validateOfficeFile(file: Partial<OfficeFile>) {
  if (!file.title || !file.title.trim()) throw new Error("Title required");
  if (file.title.trim().length > 200) throw new Error("Title too long");
  if (file.type && !["document", "spreadsheet"].includes(file.type)) throw new Error("Invalid type");
  if (file.content) {
    const size = JSON.stringify(file.content).length;
    if (size > MAX_CONTENT_SIZE) throw new Error("Content too large (max 5MB)");
  }
  if (file.linkedEntities) {
    if (!Array.isArray(file.linkedEntities)) throw new Error("Invalid linkedEntities");
    for (const le of file.linkedEntities) {
      if (!le.entityType || !le.entityId) throw new Error("Invalid linked entity");
      const allowed = ["customer", "supplier", "worker", "product", "sale", "purchase", "payment", "invoice", "vehicle", "task"];
      if (!allowed.includes(le.entityType)) throw new Error(`Invalid entityType ${le.entityType}`);
    }
  }
}

export class OfficeFileService extends BaseService {
  async create(input: Omit<OfficeFile, "id" | "createdAt" | "updatedAt" | "syncStatus"> & Partial<Pick<OfficeFile, "id">>): Promise<OfficeFile> {
    validateOfficeFile(input as any);
    return runDatabaseTransaction(async () => {
      const now = Date.now();
      const file: OfficeFile = {
        id: (input as any).id || generateId(),
        type: input.type as any,
        title: input.title.trim(),
        description: input.description?.trim(),
        content: input.content ?? (input.type === "document" ? getBlankDocumentContent() : getBlankSpreadsheetContent()),
        contentVersion: 1,
        tags: input.tags ?? [],
        linkedEntities: input.linkedEntities ?? [],
        templateId: (input as any).templateId,
        isFavorite: input.isFavorite ?? false,
        isArchived: input.isArchived ?? false,
        lastOpenedAt: now,
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
        createdBy: (input as any).createdBy,
      };
      await officeFileRepository.create(file);
      return file;
    });
  }

  async getById(id: string): Promise<OfficeFile | undefined> {
    this.assertValidId(id, "OfficeFile");
    return officeFileRepository.getById(id);
  }

  async getAll(): Promise<OfficeFile[]> {
    return officeFileRepository.getAll();
  }

  async getByType(type: OfficeFile["type"]): Promise<OfficeFile[]> {
    return officeFileRepository.getByType(type);
  }

  async update(id: string, updates: Partial<OfficeFile>): Promise<void> {
    this.assertValidId(id, "OfficeFile");
    const existing = await officeFileRepository.getById(id);
    if (!existing) throw new Error("File not found");
    // Merge patch with existing to validate complete resulting file invariants
    const next = { ...existing, ...updates } as OfficeFile;
    validateOfficeFile(next as any);
    const toSave: any = { ...updates };
    if (toSave.title !== undefined) toSave.title = toSave.title.trim();
    if (toSave.description !== undefined) toSave.description = toSave.description?.trim();
    // bump contentVersion if content changed
    if (updates.content !== undefined) {
      toSave.contentVersion = (existing.contentVersion ?? 0) + 1;
    }
    await officeFileRepository.update(id, { ...toSave, updatedAt: Date.now(), syncStatus: "pending" });
  }

  async duplicate(id: string): Promise<OfficeFile> {
    const orig = await this.getById(id);
    if (!orig) throw new Error("File not found");
    const now = Date.now();
    const copy: OfficeFile = {
      ...orig,
      id: generateId(),
      title: `Copy of ${orig.title}`,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
      syncStatus: "pending",
      serverRevision: undefined,
      lastSyncedAt: undefined,
      isArchived: false,
      deletedAt: undefined,
    };
    // Remove sync meta that shouldn't be inherited
    await officeFileRepository.create(copy);
    return copy;
  }

  async archive(id: string, archived: boolean): Promise<void> {
    await this.update(id, { isArchived: archived, deletedAt: undefined } as any);
  }

  async toggleFavorite(id: string): Promise<void> {
    const f = await this.getById(id);
    if (!f) return;
    await this.update(id, { isFavorite: !f.isFavorite } as any);
  }

  async deletePermanent(id: string): Promise<void> {
    this.assertValidId(id, "OfficeFile");
    await officeFileRepository.delete(id);
  }

  async touchOpened(id: string): Promise<void> {
    // lastOpenedAt is local-only, should not enqueue sync
    try {
      const { db } = await import("../lib/database/db");
      const { runAsRemote } = await import("../lib/database/sync-hooks");
      await runAsRemote(async () => {
        await db.officeFiles.update(id, { lastOpenedAt: Date.now() });
      });
      return;
    } catch {}
    // fallback: silent local update if hook not available
    try {
      await officeFileRepository.update(id, { lastOpenedAt: Date.now() } as any, { source: "local" } as any);
    } catch {}
  }
}

export function getBlankDocumentContent() {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [] }
    ]
  };
}

export function getLocalizedSheetName(language: string = "en"): string {
  if (language === "fr") return "Feuille 1";
  if (language === "ar") return "ورقة 1";
  return "Sheet 1";
}

export function getBlankSpreadsheetContent(language: string = "en") {
  // Univer workbook snapshot minimal structure — compatible with Univer preset-sheets-core
  // We'll store a simple grid representation that our Univer wrapper can hydrate
  // Use a lightweight custom workbook JSON to avoid heavy Univer dependency at creation
  // Localized default sheet name: EN Sheet 1, FR Feuille 1, AR ورقة 1
  return {
    sheets: [
      {
        id: "sheet-1",
        name: getLocalizedSheetName(language),
        data: {}, // cell map row/col -> value
        rowCount: 100,
        colCount: 20,
      }
    ],
    activeSheetId: "sheet-1",
  };
}

export const officeFileService = new OfficeFileService();
