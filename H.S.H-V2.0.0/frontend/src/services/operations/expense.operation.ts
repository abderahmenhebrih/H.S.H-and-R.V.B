import { db } from "../../lib/database/db";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { expenseService } from "../expense.service";
import { runDatabaseTransaction } from "./database-transaction";

export class ExpenseOperation {
  async create(input: {
    name: string;
    amount: number;
    accountId: string;
    date: number;
    note?: string;
  }) {
    return runDatabaseTransaction(async () => {
      if (input.amount <= 0) {
        throw new Error("Expense amount must be greater than zero.");
      }

      const account = await db.bankAccounts.get(input.accountId);

      if (!account) {
        throw new Error("Account not found.");
      }

      if (account.balance < input.amount) {
        throw new Error("Insufficient account balance.");
      }

      const expense = await expenseService.create(input);

      await bankAccountRepository.update(input.accountId, {
        balance: account.balance - input.amount,
        updatedAt: Date.now(),
        });

      return expense;
    });
  }
}

export const expenseOperation = new ExpenseOperation();
