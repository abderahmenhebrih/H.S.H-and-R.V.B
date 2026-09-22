import { generateId } from "../lib/id";
import { transferRepository } from "../repositories/transfer.repository";
import type { Transfer } from "../types/entities/transfer";
import { BaseService } from "./base.service";

export class TransferService extends BaseService {
  async create(input: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: number;
    note?: string;
  }): Promise<Transfer> {
    if (input.amount <= 0) {
      throw new Error("Transfer amount must be greater than zero.");
    }

    this.assertValidId(input.fromAccountId, "Source account");
    this.assertValidId(input.toAccountId, "Destination account");

    if (input.fromAccountId === input.toAccountId) {
      throw new Error("Source and destination accounts must be different.");
    }

    const now = Date.now();

    const transfer: Transfer = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amount: input.amount,
      date: input.date,
      note: input.note,
    };

    await transferRepository.create(transfer);

    return transfer;
  }

  async getById(id: string): Promise<Transfer | undefined> {
    this.assertValidId(id, "Transfer");
    return transferRepository.getById(id);
  }

  async getAll(): Promise<Transfer[]> {
    return transferRepository.getAll();
  }

  async getByAccountId(accountId: string): Promise<Transfer[]> {
    this.assertValidId(accountId, "Account");
    return transferRepository.getByAccountId(accountId);
  }

  async getByDateRange(from: number, to: number): Promise<Transfer[]> {
    return transferRepository.getByDateRange(from, to);
  }
}

export const transferService = new TransferService();
