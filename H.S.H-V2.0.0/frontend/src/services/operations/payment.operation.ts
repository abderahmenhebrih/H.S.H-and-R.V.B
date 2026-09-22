import { db } from "../../lib/database/db";
import { paymentService } from "../payment.service";
import { runDatabaseTransaction } from "./database-transaction";
import type { Payment } from "../../types/entities/payment";
import { supplierRepository } from "../../repositories/supplier.repository";
import { customerRepository } from "../../repositories/customer.repository";
import { workerRepository } from "../../repositories/worker.repository";
import { bankAccountRepository } from "../../repositories/bank-account.repository";

export class PaymentOperation {
  async create(input: {
    entityType: Payment["entityType"];
    entityId: string;
    accountId: string;
    amount: number;
    date: number;
    note?: string;
  }) {
    return runDatabaseTransaction(async () => {
      if (input.amount <= 0) {
        throw new Error("Payment amount must be greater than zero.");
      }

      const account = await db.bankAccounts.get(input.accountId);

      if (!account) {
        throw new Error("Account not found.");
      }

      if (account.balance < input.amount) {
        throw new Error("Insufficient account balance.");
      }

      switch (input.entityType) {
        case "supplier": {
          const supplier = await db.suppliers.get(input.entityId);

          if (!supplier) {
            throw new Error("Supplier not found.");
          }

          if (supplier.balance < input.amount) {
            throw new Error("Payment exceeds supplier balance.");
          }

          await supplierRepository.update(input.entityId, {
            balance: supplier.balance - input.amount,
          } as any);

          await bankAccountRepository.update(input.accountId, {
            balance: account.balance - input.amount,
          } as any);

          break;
        }

        case "customer": {
          const customer = await db.customers.get(input.entityId);

          if (!customer) {
            throw new Error("Customer not found.");
          }

          if (customer.balance < input.amount) {
            throw new Error("Payment exceeds customer balance.");
          }

          await customerRepository.update(input.entityId, {
            balance: customer.balance - input.amount,
          } as any);

          await bankAccountRepository.update(input.accountId, {
            balance: account.balance + input.amount,
          } as any);

          break;
        }

        case "worker": {
          const worker = await db.workers.get(input.entityId);

          if (!worker) {
            throw new Error("Worker not found.");
          }

          if (worker.status !== "active") {
            throw new Error("Archived worker cannot receive payments.");
          }

          if (worker.balance < input.amount) {
            throw new Error("Payment exceeds worker balance.");
          }

          if (account.balance < input.amount) {
            throw new Error("Insufficient account balance.");
          }

          await workerRepository.update(input.entityId, {
            balance: worker.balance - input.amount,
          } as any);

          await bankAccountRepository.update(input.accountId, {
            balance: account.balance - input.amount,
          } as any);

          break;
        }

        case "expense": {
          const expense = await db.expenses.get(input.entityId);

          if (!expense) {
            throw new Error("Expense not found.");
          }

          await bankAccountRepository.update(input.accountId, {
            balance: account.balance - input.amount,
          } as any);

          break;
        }

        default:
          throw new Error("Unsupported payment entity type.");
      }

      const payment = await paymentService.create(input);
      // Notification (local only, will sync)
      try {
        const { notifyPayment } = await import("../notification-engine");
        const settings: any = await (await import("../settings.service")).settingsService.get();
        const currency = settings?.currency ?? "DA";
        let entityName: string | undefined;
        if (input.entityType === "supplier") {
          const s = await db.suppliers.get(input.entityId);
          entityName = s?.name;
        } else if (input.entityType === "customer") {
          const c = await db.customers.get(input.entityId);
          entityName = c?.name;
        } else if (input.entityType === "worker") {
          const w = await db.workers.get(input.entityId);
          entityName = w?.name;
        } else if (input.entityType === "expense") {
          const e = await db.expenses.get(input.entityId);
          entityName = (e as any)?.name ?? (e as any)?.note;
        }
        await notifyPayment({
          paymentId: payment.id,
          amount: input.amount,
          currency,
          entityName,
          entityType: input.entityType,
        });
      } catch {}
      return payment;
    });
  }
}

export const paymentOperation = new PaymentOperation();
