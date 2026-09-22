import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Transfer } from "../types/entities/transfer";

export class TransferRepository extends BaseRepository<Transfer> {
  constructor() {
    super(db.transfers, "transfer");
  }

  async getByAccountId(accountId: string): Promise<Transfer[]> {
    return this.table
      .filter(
        (transfer) =>
          transfer.fromAccountId === accountId ||
          transfer.toAccountId === accountId,
      )
      .toArray();
  }

  async getByDateRange(from: number, to: number): Promise<Transfer[]> {
    return this.table
      .where("date")
      .between(from, to, true, true)
      .toArray();
  }
}

export const transferRepository = new TransferRepository();

