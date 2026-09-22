import { db } from "../../lib/database/db";
import { workerRepository } from "../../repositories/worker.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class WorkerSalaryOperation {
  async accrue(input: {
    workerId: string;
    amount: number;
  }) {
    return runDatabaseTransaction(async () => {
      if (input.amount <= 0) {
        throw new Error("Salary amount must be greater than zero.");
      }

      const worker = await db.workers.get(input.workerId);

      if (!worker) {
        throw new Error("Worker not found.");
      }

      const now = Date.now();

      await workerRepository.update(input.workerId, {
        balance: worker.balance + input.amount,
        updatedAt: now,
      } as any);

      return db.workers.get(input.workerId);
    });
  }
}

export const workerSalaryOperation = new WorkerSalaryOperation();
