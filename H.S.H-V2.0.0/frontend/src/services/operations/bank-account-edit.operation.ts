import { db } from "../../lib/database/db";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class BankAccountEditOperation {
  async edit(input: {
    accountId: string;
    name: string;
  }) {
    return runDatabaseTransaction(async () => {
      if (!input.name.trim()) {
        throw new Error("Account name is required.");
      }

      const account = await bankAccountRepository.getById(input.accountId);

      if (!account) {
        throw new Error("Bank account not found.");
      }

      const existing = await bankAccountRepository.getByName(input.name);

      if (existing && existing.id !== input.accountId) {
        throw new Error("A bank account with this name already exists.");
      }

      await bankAccountRepository.update(input.accountId, {
        name: input.name,
        updatedAt: Date.now(),
        syncStatus: "pending",
      });

      return db.bankAccounts.get(input.accountId);
    });
  }
}

export const bankAccountEditOperation =
  new BankAccountEditOperation();
