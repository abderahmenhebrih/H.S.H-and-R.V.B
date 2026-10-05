import { db } from "../../lib/database/db";
import { workerRepository } from "../../repositories/worker.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class WorkerEditOperation {
  async edit(input: {
    workerId: string;
    name: string;
    phone: string;
    address?: string;
    birthDate?: number;
    employmentDate: number;
    position: string;
    notes?: string;
    startingSalary: number;
    monthlySalary: number;
  }) {
    return runDatabaseTransaction(async () => {
      if (!input.name.trim()) {
        throw new Error("Worker name is required.");
      }

      if (!input.phone.trim()) {
        throw new Error("Worker phone is required.");
      }

      if (!input.position.trim()) {
        throw new Error("Worker position is required.");
      }

      // startingSalary = initial worker balance (opening balance): signed finite
      // number allowed (negative / zero / positive). Monthly stays >= 0.
      if (!Number.isFinite(input.startingSalary)) {
        throw new Error("Starting salary must be a valid number.");
      }

      if (!Number.isFinite(input.monthlySalary)) {
        throw new Error("Monthly salary must be a valid number.");
      }

      if (input.monthlySalary < 0) {
        throw new Error("Monthly salary cannot be negative.");
      }

      const worker = await workerRepository.getById(input.workerId);

      if (!worker) {
        throw new Error("Worker not found.");
      }

      const existing = await workerRepository.getByName(input.name);

      if (existing && existing.id !== input.workerId) {
        throw new Error("A worker with this name already exists.");
      }

      await workerRepository.update(input.workerId, {
        name: input.name,
        phone: input.phone,
        address: input.address,
        birthDate: input.birthDate,
        employmentDate: input.employmentDate,
        position: input.position,
        notes: input.notes,
        startingSalary: input.startingSalary,
        monthlySalary: input.monthlySalary,
        updatedAt: Date.now(),
        syncStatus: "pending",
      });

      return db.workers.get(input.workerId);
    });
  }
}

export const workerEditOperation = new WorkerEditOperation();
