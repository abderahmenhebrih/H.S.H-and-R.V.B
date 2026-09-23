import { db } from "../../lib/database/db";
import { customerRepository } from "../../repositories/customer.repository";
import { productRepository } from "../../repositories/product.repository";
import { saleRepository } from "../../repositories/sale.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class SaleReversalOperation {
  async delete(saleId: string) {
    return runDatabaseTransaction(async () => {
      const sale = await saleRepository.getById(saleId);

      if (!sale) {
        throw new Error("Sale not found.");
      }

      const customer = await db.customers.get(sale.customerId);

      if (!customer) {
        throw new Error("Customer not found.");
      }

      if (customer.balance < sale.total) {
        throw new Error(
          "Cannot reverse sale because customer balance is insufficient.",
        );
      }

      for (const item of sale.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
      }

      const now = Date.now();

      for (const item of sale.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        await productRepository.update(item.productId, {
          quantity: product.quantity + item.quantity,
          weightKg: product.weightKg + item.weightKg,
          updatedAt: now,
        } as any, { queueSync: false } as any);
      }

      await customerRepository.update(sale.customerId, {
        balance: customer.balance - sale.total,
        updatedAt: now,
      } as any, { queueSync: false } as any);

      await saleRepository.delete(saleId);
    });
  }
}

export const saleReversalOperation =
  new SaleReversalOperation();
