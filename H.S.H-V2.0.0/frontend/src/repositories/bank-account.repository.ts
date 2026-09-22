import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { BankAccount } from "../types/entities/bank-account";

export class BankAccountRepository extends BaseRepository<BankAccount> {
  constructor() {
    super(db.bankAccounts, "bankAccount");
  }

  async getByName(name: string): Promise<BankAccount | undefined> {
    return this.table.where("name").equals(name).first();
  }
}

export const bankAccountRepository = new BankAccountRepository();

