import { db } from "../../lib/database/db";
import { expenseRepository } from "../../repositories/expense.repository";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class ExpenseEditOperation {
  async edit(input: {
    expenseId: string;
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

      const expense = await expenseRepository.getById(input.expenseId);

      if (!expense) {
        throw new Error("Expense not found.");
      }

      const oldAccount = await db.bankAccounts.get(expense.accountId);

      if (!oldAccount) {
        throw new Error("Original account not found.");
      }

      // Reverse original expense.
      await bankAccountRepository.update(expense.accountId, {
        balance: oldAccount.balance + expense.amount,
        updatedAt: Date.now(),
      } as any);

      // Apply new expense.
      const newAccount = await db.bankAccounts.get(input.accountId);

      if (!newAccount) {
        throw new Error("Account not found.");
      }

      if (newAccount.balance < input.amount) {
        throw new Error("Insufficient account balance.");
      }

      await bankAccountRepository.update(input.accountId, {
        balance: newAccount.balance - input.amount,
        updatedAt: Date.now(),
      } as any);

      await expenseRepository.update(input.expenseId, {
        name: input.name,
        amount: input.amount,
        accountId: input.accountId,
        date: input.date,
        note: input.note,
        updatedAt: Date.now(),
        syncStatus: "pending",
      });

      return expenseRepository.getById(input.expenseId);
    });
  }
}

export const expenseEditOperation = new ExpenseEditOperation();
