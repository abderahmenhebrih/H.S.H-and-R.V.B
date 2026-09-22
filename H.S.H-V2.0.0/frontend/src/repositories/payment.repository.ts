import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Payment } from "../types/entities/payment";

export class PaymentRepository extends BaseRepository<Payment> {
  constructor() {
    super(db.payments, "payment");
  }

  async getByEntity(
    entityType: Payment["entityType"],
    entityId: string,
  ): Promise<Payment[]> {
    return this.table
      .where("entityId")
      .equals(entityId)
      .filter((payment) => payment.entityType === entityType)
      .toArray();
  }

  async getByAccountId(accountId: string): Promise<Payment[]> {
    return this.table.where("accountId").equals(accountId).toArray();
  }

  async getByDateRange(from: number, to: number): Promise<Payment[]> {
    return this.table
      .where("date")
      .between(from, to, true, true)
      .toArray();
  }
}

export const paymentRepository = new PaymentRepository();

