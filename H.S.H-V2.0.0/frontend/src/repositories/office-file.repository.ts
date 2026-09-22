import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { OfficeFile } from "../types/entities/office-file";

export class OfficeFileRepository extends BaseRepository<OfficeFile> {
  constructor() {
    super(db.officeFiles, "officeFile");
  }

  async getByType(type: OfficeFile["type"]): Promise<OfficeFile[]> {
    return this.table.where("type").equals(type).toArray();
  }

  async getArchived(): Promise<OfficeFile[]> {
    return this.table.where("isArchived").equals(1 as any).toArray();
  }

  async getFavorites(): Promise<OfficeFile[]> {
    return this.table.where("isFavorite").equals(1 as any).toArray();
  }
}

export const officeFileRepository = new OfficeFileRepository();
