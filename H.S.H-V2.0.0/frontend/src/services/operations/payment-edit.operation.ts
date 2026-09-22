import { db } from "../../lib/database/db";
import { paymentRepository } from "../../repositories/payment.repository";
import { supplierRepository } from "../../repositories/supplier.repository";
import { customerRepository } from "../../repositories/customer.repository";
import { workerRepository } from "../../repositories/worker.repository";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { runDatabaseTransaction } from "./database-transaction";
import type { Payment } from "../../types/entities/payment";

export class PaymentEditOperation {
  async edit(input: {
    paymentId: string;
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

      const payment = await paymentRepository.getById(input.paymentId);

      if (!payment) {
        throw new Error("Payment not found.");
      }

      const oldAccount = await db.bankAccounts.get(payment.accountId);

      if (!oldAccount) {
        throw new Error("Original account not found.");
      }

      // Reverse old payment
      switch (payment.entityType) {
        case "supplier": {
          const supplier = await db.suppliers.get(payment.entityId);

          if (!supplier) {
            throw new Error("Original supplier not found.");
          }

          await supplierRepository.update(payment.entityId, {
            balance: supplier.balance + payment.amount,
            updatedAt: Date.now(),
          } as any);

          await bankAccountRepository.update(payment.accountId, {
            balance: oldAccount.balance + payment.amount,
            updatedAt: Date.now(),
          } as any);

          break;
        }

        case "customer": {
          const customer = await db.customers.get(payment.entityId);

          if (!customer) {
            throw new Error("Original customer not found.");
          }

          await customerRepository.update(payment.entityId, {
            balance: customer.balance + payment.amount,
            updatedAt: Date.now(),
          } as any);

          await bankAccountRepository.update(payment.accountId, {
            balance: oldAccount.balance - payment.amount,
            updatedAt: Date.now(),
          } as any);

          break;
        }

        case "worker": {
          const worker = await db.workers.get(payment.entityId);

          if (!worker) {
            throw new Error("Original worker not found.");
          }

          await workerRepository.update(payment.entityId, {
            balance: worker.balance + payment.amount,
            updatedAt: Date.now(),
          } as any);

          await bankAccountRepository.update(payment.accountId, {
            balance: oldAccount.balance + payment.amount,
            updatedAt: Date.now(),
          } as any);

          break;
        }

        case "expense": {
          const expense = await db.expenses.get(payment.entityId);

          if (!expense) {
            throw new Error("Original expense not found.");
          }

          await bankAccountRepository.update(payment.accountId, {
            balance: oldAccount.balance + payment.amount,
            updatedAt: Date.now(),
          } as any);

          break;
        }
      }

      // Validate and apply new payment
      const newAccount = await db.bankAccounts.get(input.accountId);

      if (!newAccount) {
        throw new Error("Account not found.");
      }

      if (newAccount.balance < input.amount) {
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
            updatedAt: Date.now(),
          } as any);

          await bankAccountRepository.update(input.accountId, {
            balance: newAccount.balance - input.amount,
            updatedAt: Date.now(),
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
            updatedAt: Date.now(),
          } as any);

          await bankAccountRepository.update(input.accountId, {
            balance: newAccount.balance + input.amount,
            updatedAt: Date.now(),
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

          await workerRepository.update(input.entityId, {
            balance: worker.balance - input.amount,
            updatedAt: Date.now(),
          } as any);

          await bankAccountRepository.update(input.accountId, {
            balance: newAccount.balance - input.amount,
            updatedAt: Date.now(),
          } as any);

          break;
        }

        case "expense": {
          const expense = await db.expenses.get(input.entityId);

          if (!expense) {
            throw new Error("Expense not found.");
          }

          await bankAccountRepository.update(input.accountId, {
            balance: newAccount.balance - input.amount,
            updatedAt: Date.now(),
          } as any);

          break;
        }

        default:
          throw new Error("Unsupported payment entity type.");
      }

      await paymentRepository.update(input.paymentId, {
        entityType: input.entityType,
        entityId: input.entityId,
        accountId: input.accountId,
        amount: input.amount,
        date: input.date,
        note: input.note,
        updatedAt: Date.now(),
        syncStatus: "pending",
      });

      return paymentRepository.getById(input.paymentId);
    });
  }
}

export const paymentEditOperation = new PaymentEditOperation();
