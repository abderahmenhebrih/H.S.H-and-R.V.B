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

      if (worker.balance !== 0) {
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
      if (input.startingSalary < 0) {
        throw new Error("Starting salary cannot be negative.");
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
