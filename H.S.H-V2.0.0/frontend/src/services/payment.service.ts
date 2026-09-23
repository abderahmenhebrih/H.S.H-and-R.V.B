import { generateId } from "../lib/id";
import { paymentRepository } from "../repositories/payment.repository";
import type { Payment } from "../types/entities/payment";
import { BaseService } from "./base.service";

export class PaymentService extends BaseService {
  async create(input: {
    entityType: Payment["entityType"];
    entityId: string;
    accountId: string;
    amount: number;
    date: number;
    note?: string;
  }): Promise<Payment> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error("Payment amount must be a finite number greater than zero.");
    }
    if (!Number.isFinite(input.date)) {
      throw new Error("Payment date must be a valid finite timestamp.");
    }

    this.assertValidId(input.entityId, "Payment entity");
    this.assertValidId(input.accountId, "Account");

    const now = Date.now();

    const payment: Payment = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      entityType: input.entityType,
      entityId: input.entityId,
      accountId: input.accountId,
      amount: input.amount,
      date: input.date,
      note: input.note,
    };

    await paymentRepository.create(payment);

    return payment;
  }

  async getById(id: string): Promise<Payment | undefined> {
    this.assertValidId(id, "Payment");
    return paymentRepository.getById(id);
  }

  async getAll(): Promise<Payment[]> {
    return paymentRepository.getAll();
  }

  async getByEntity(
    entityType: Payment["entityType"],
    entityId: string,
  ): Promise<Payment[]> {
    this.assertValidId(entityId, "Payment entity");
    return paymentRepository.getByEntity(entityType, entityId);
  }

  async getByAccountId(accountId: string): Promise<Payment[]> {
    this.assertValidId(accountId, "Account");
    return paymentRepository.getByAccountId(accountId);
  }

  async getByDateRange(from: number, to: number): Promise<Payment[]> {
    return paymentRepository.getByDateRange(from, to);
  }
}

export const paymentService = new PaymentService();
