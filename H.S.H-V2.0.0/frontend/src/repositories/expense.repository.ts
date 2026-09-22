import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Expense } from "../types/entities/expense";

export class ExpenseRepository extends BaseRepository<Expense> {
  constructor() {
    super(db.expenses, "expense");
  }

  async getByName(name: string): Promise<Expense | undefined> {
    return this.table.where("name").equals(name).first();
  }

  async getByAccountId(accountId: string): Promise<Expense[]> {
    return this.table.where("accountId").equals(accountId).toArray();
  }
}

export const expenseRepository = new ExpenseRepository();

