import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Worker } from "../types/entities/worker";

export class WorkerRepository extends BaseRepository<Worker> {
  constructor() {
    super(db.workers, "worker");
  }

  async getByName(name: string): Promise<Worker | undefined> {
    return this.table.where("name").equals(name).first();
  }
}

export const workerRepository = new WorkerRepository();

