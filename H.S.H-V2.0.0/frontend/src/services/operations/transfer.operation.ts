import { db } from "../../lib/database/db";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { transferService } from "../transfer.service";
import { runDatabaseTransaction } from "./database-transaction";

export class TransferOperation {
  async create(input: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: number;
    note?: string;
  }) {
    return runDatabaseTransaction(async () => {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error("Transfer amount must be a finite number greater than zero.");
      }
      if (!Number.isFinite(input.date)) {
        throw new Error("Transfer date must be a valid finite timestamp.");
      }

      if (input.fromAccountId === input.toAccountId) {
        throw new Error(
          "Source and destination accounts must be different.",
        );
      }

      const sourceAccount = await db.bankAccounts.get(
        input.fromAccountId,
      );

      if (!sourceAccount) {
        throw new Error("Source account not found.");
      }

      const destinationAccount = await db.bankAccounts.get(
        input.toAccountId,
      );

      if (!destinationAccount) {
        throw new Error("Destination account not found.");
      }

      if (!Number.isFinite(sourceAccount.balance) || !Number.isFinite(destinationAccount.balance)) {
        throw new Error("Account balance corrupted.");
      }

      if (sourceAccount.balance < input.amount) {
        throw new Error("Insufficient source account balance.");
      }

      const now = Date.now();

      await bankAccountRepository.update(input.fromAccountId, {
        balance: sourceAccount.balance - input.amount,
        updatedAt: now,
        });

      await bankAccountRepository.update(input.toAccountId, {
        balance: destinationAccount.balance + input.amount,
        updatedAt: now,
        });

      return transferService.create(input);
    });
  }
}

export const transferOperation = new TransferOperation();
