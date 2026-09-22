import { generateId } from "../lib/id";
import { expenseRepository } from "../repositories/expense.repository";
import type { Expense } from "../types/entities/expense";
import { BaseService } from "./base.service";

export class ExpenseService extends BaseService {
  async create(input: {
    name: string;
    amount: number;
    accountId: string;
    date: number;
    note?: string;
  }): Promise<Expense> {
    if (input.amount <= 0) {
      throw new Error("Expense amount must be greater than zero.");
    }

    const now = Date.now();

    const expense: Expense = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: input.name,
      amount: input.amount,
      accountId: input.accountId,
      date: input.date,
      note: input.note,
    };

    await expenseRepository.create(expense);

    return expense;
  }

  async getById(id: string): Promise<Expense | undefined> {
    this.assertValidId(id, "Expense");
    return expenseRepository.getById(id);
  }

  async getAll(): Promise<Expense[]> {
    return expenseRepository.getAll();
  }
}

export const expenseService = new ExpenseService();
