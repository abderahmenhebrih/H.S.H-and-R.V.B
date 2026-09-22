import { db } from "../../lib/database/db";
import { workerRepository } from "../../repositories/worker.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class WorkerBalanceOperation {
  async addBonus(input: {
    workerId: string;
    date: number;
    amount: number;
  }) {
    return runDatabaseTransaction(async () => {
      if (input.amount <= 0) {
        throw new Error("Bonus amount must be greater than zero.");
      }

      const worker = await db.workers.get(input.workerId);

      if (!worker) {
        throw new Error("Worker not found.");
      }

      if (worker.status !== "active") {
        throw new Error("Archived worker cannot receive a bonus.");
      }

      await workerRepository.update(input.workerId, {
        balance: worker.balance + input.amount,
        updatedAt: Date.now(),
        });

      return db.workers.get(input.workerId);
    });
  }

  async addAbsence(input: {
    workerId: string;
    date: number;
    amount: number;
  }) {
    return runDatabaseTransaction(async () => {
      if (input.amount <= 0) {
        throw new Error("Absence amount must be greater than zero.");
      }

      const worker = await db.workers.get(input.workerId);

      if (!worker) {
        throw new Error("Worker not found.");
      }

      if (worker.status !== "active") {
        throw new Error("Archived worker cannot receive an absence.");
      }

      if (worker.balance < input.amount) {
        throw new Error("Absence amount exceeds worker balance.");
      }

      await workerRepository.update(input.workerId, {
        balance: worker.balance - input.amount,
        updatedAt: Date.now(),
        });

      return db.workers.get(input.workerId);
    });
  }
}

export const workerBalanceOperation = new WorkerBalanceOperation();
