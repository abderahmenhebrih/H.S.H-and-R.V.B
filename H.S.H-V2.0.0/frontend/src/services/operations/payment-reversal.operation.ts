import { db } from "../../lib/database/db";
import { workerRepository } from "../../repositories/worker.repository";
import { customerRepository } from "../../repositories/customer.repository";
import { supplierRepository } from "../../repositories/supplier.repository";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { paymentRepository } from "../../repositories/payment.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class PaymentReversalOperation {
  async delete(paymentId: string) {
    return runDatabaseTransaction(async () => {
      const payment = await paymentRepository.getById(paymentId);

      if (!payment) {
        throw new Error("Payment not found.");
      }

      const account = await db.bankAccounts.get(payment.accountId);

      if (!account) {
        throw new Error("Account not found.");
      }

      switch (payment.entityType) {
        case "supplier": {
          const supplier = await db.suppliers.get(payment.entityId);

          if (!supplier) {
            throw new Error("Supplier not found.");
          }

          await supplierRepository.update(payment.entityId, {
            balance: supplier.balance + payment.amount,
            updatedAt: Date.now(),
          } as any, { queueSync: false } as any);

          await bankAccountRepository.update(payment.accountId, {
            balance: account.balance + payment.amount,
            updatedAt: Date.now(),
          } as any, { queueSync: false } as any);

          break;
        }

        case "customer": {
          const customer = await db.customers.get(payment.entityId);

          if (!customer) {
            throw new Error("Customer not found.");
          }

          await customerRepository.update(payment.entityId, {
            balance: customer.balance + payment.amount,
            updatedAt: Date.now(),
          } as any, { queueSync: false } as any);

          await bankAccountRepository.update(payment.accountId, {
            balance: account.balance - payment.amount,
            updatedAt: Date.now(),
          } as any, { queueSync: false } as any);

          break;
        }

        case "worker": {
          const worker = await db.workers.get(payment.entityId);

          if (!worker) {
            throw new Error("Worker not found.");
          }

          await workerRepository.update(payment.entityId, {
            balance: worker.balance + payment.amount,
            updatedAt: Date.now(),
          } as any, { queueSync: false } as any);

          await bankAccountRepository.update(payment.accountId, {
            balance: account.balance + payment.amount,
            updatedAt: Date.now(),
          } as any, { queueSync: false } as any);

          break;
        }

        case "expense": {
          const expense = await db.expenses.get(payment.entityId);

          if (!expense) {
            throw new Error("Expense not found.");
          }

          await bankAccountRepository.update(payment.accountId, {
            balance: account.balance + payment.amount,
            updatedAt: Date.now(),
          } as any, { queueSync: false } as any);

          break;
        }

        default:
          throw new Error("Unsupported payment entity type.");
      }

      await paymentRepository.delete(paymentId);
    });
  }
}

export const paymentReversalOperation =
  new PaymentReversalOperation();
