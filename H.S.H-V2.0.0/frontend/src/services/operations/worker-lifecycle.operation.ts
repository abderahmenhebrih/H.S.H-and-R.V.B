import { db } from "../../lib/database/db";
import { workerRepository } from "../../repositories/worker.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class WorkerLifecycleOperation {
  async archive(workerId: string) {
    return runDatabaseTransaction(async () => {
      const worker = await db.workers.get(workerId);

      if (!worker) {
        throw new Error("Worker not found.");
      }

      if (worker.status === "archived") {
        throw new Error("Worker is already archived.");
      }

      // Use rounded monetary comparison (cents epsilon) — balances are monetary
      const rounded = Math.round(worker.balance * 100) / 100;
      if (Math.abs(rounded) > 0.005) {
        throw new Error(
          "Cannot archive worker while the worker balance is not zero.",
        );
      }

      await workerRepository.update(workerId, {
        status: "archived",
        updatedAt: Date.now(),
      } as any);

      return db.workers.get(workerId);
    });
  }

  async restore(input: {
    workerId: string;
    startingSalary: number;
    monthlySalary: number;
  }) {
    return runDatabaseTransaction(async () => {
      // startingSalary = opening balance: signed finite allowed (negative/zero/positive).
      // Monthly salary policy preserved: zero or positive only.
      if (!Number.isFinite(input.startingSalary)) {
        throw new Error("Starting salary must be a valid number.");
      }

      if (!Number.isFinite(input.monthlySalary)) {
        throw new Error("Monthly salary must be a valid number.");
      }

      if (input.monthlySalary < 0) {
        throw new Error("Monthly salary cannot be negative.");
      }

      const worker = await db.workers.get(input.workerId);

      if (!worker) {
        throw new Error("Worker not found.");
      }

      if (worker.status === "active") {
        throw new Error("Worker is already active.");
      }

      await workerRepository.update(input.workerId, {
        status: "active",
        startingSalary: input.startingSalary,
        monthlySalary: input.monthlySalary,
        updatedAt: Date.now(),
      } as any);

      return db.workers.get(input.workerId);
    });
  }
}

export const workerLifecycleOperation =
  new WorkerLifecycleOperation();
