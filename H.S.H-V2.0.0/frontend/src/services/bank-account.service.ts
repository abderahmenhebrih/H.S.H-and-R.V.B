import { generateId } from "../lib/id";
import { bankAccountRepository } from "../repositories/bank-account.repository";
import type {
  BankAccount,
  BankAccountType,
} from "../types/entities/bank-account";
import { BaseService } from "./base.service";

export class BankAccountService extends BaseService {
  async create(input: {
    type: BankAccountType;
    name: string;
    initialBalance?: number;
    notes?: string;
  }): Promise<BankAccount> {
    const existing = await bankAccountRepository.getByName(input.name);

    if (existing) {
      throw new Error("A bank account with this name already exists.");
    }

    const initialBalance = input.initialBalance ?? 0;

    if (initialBalance < 0) {
      throw new Error("Initial balance cannot be negative.");
    }

    const now = Date.now();

    const account: BankAccount = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      type: input.type,
      name: input.name,
      initialBalance,
      balance: initialBalance,
      notes: input.notes,
    };

    await bankAccountRepository.create(account);

    return account;
  }

  async getById(id: string): Promise<BankAccount | undefined> {
    this.assertValidId(id, "Bank account");
    return bankAccountRepository.getById(id);
  }

  async getAll(): Promise<BankAccount[]> {
    return bankAccountRepository.getAll();
  }
}

export const bankAccountService = new BankAccountService();
