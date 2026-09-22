import { db } from "../../lib/database/db";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { expenseRepository } from "../../repositories/expense.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class ExpenseReversalOperation {
  async delete(expenseId: string) {
    return runDatabaseTransaction(async () => {
      const expense = await expenseRepository.getById(expenseId);

      if (!expense) {
        throw new Error("Expense not found.");
      }

      const account = await db.bankAccounts.get(expense.accountId);

      if (!account) {
        throw new Error("Account not found.");
      }

      await bankAccountRepository.update(expense.accountId, {
        balance: account.balance + expense.amount,
        updatedAt: Date.now(),
        });

      await expenseRepository.delete(expenseId);
    });
  }
}

export const expenseReversalOperation =
  new ExpenseReversalOperation();
