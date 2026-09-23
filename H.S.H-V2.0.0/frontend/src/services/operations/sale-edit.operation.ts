import { db } from "../../lib/database/db";
import { saleRepository } from "../../repositories/sale.repository";
import { customerRepository } from "../../repositories/customer.repository";
import { productRepository } from "../../repositories/product.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class SaleEditOperation {
  async edit(input: {
    saleId: string;
    customerId: string;
    date: number;
    items: {
      productId: string;
      quantity: number;
      weightKg: number;
      price: number;
      total: number;
    }[];
    total: number;
  }) {
    return runDatabaseTransaction(async () => {
      if (input.items.length === 0) {
        throw new Error("A sale must contain at least one item.");
      }

      if (input.total < 0) {
        throw new Error("Sale total cannot be negative.");
      }

      const sale = await saleRepository.getById(input.saleId);

      if (!sale) {
        throw new Error("Sale not found.");
      }

      const oldCustomer = await db.customers.get(sale.customerId);

      if (!oldCustomer) {
        throw new Error("Original customer not found.");
      }

      if (oldCustomer.balance < sale.total) {
        throw new Error(
          "Cannot edit sale because original customer balance is insufficient.",
        );
      }

      const newCustomer = await db.customers.get(input.customerId);

      if (!newCustomer) {
        throw new Error("Customer not found.");
      }

      // Validate original products.
      for (const item of sale.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Original product not found: ${item.productId}`);
        }
      }

      // Validate new sale - unified with CREATE
      for (const item of input.items) {
        if (!Number.isFinite(item.quantity) || !Number.isInteger(item.quantity) || item.quantity <= 0) {
          throw new Error(`Invalid item quantity: ${item.productId}`);
        }
        if (!Number.isFinite(item.weightKg) || item.weightKg < 0) {
          throw new Error(`Invalid item weightKg: ${item.productId}`);
        }
        if (!Number.isFinite(item.price) || item.price < 0) {
          throw new Error(`Invalid item price: ${item.productId}`);
        }
        if (!Number.isFinite(item.total) || item.total < 0) {
          throw new Error(`Invalid item total: ${item.productId}`);
        }
        const expected = Math.round(item.weightKg * item.price * 100) / 100;
        if (Math.abs(item.total - expected) > 0.005) {
          throw new Error(`Item total mismatch for ${item.productId}: expected ${expected}, got ${item.total}`);
        }

        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        const restored = sale.items
          .filter((oldItem) => oldItem.productId === item.productId)
          .reduce(
            (acc, oldItem) => ({
              quantity: acc.quantity + oldItem.quantity,
              weightKg: acc.weightKg + oldItem.weightKg,
            }),
            { quantity: 0, weightKg: 0 },
          );

        if (product.quantity + restored.quantity < item.quantity) {
          throw new Error(
            `Insufficient product quantity: ${item.productId}`,
          );
        }

        if (product.weightKg + restored.weightKg < item.weightKg) {
          throw new Error(
            `Insufficient product weight: ${item.productId}`,
          );
        }
      }

      const now = Date.now();

      // Reverse old customer balance.
      const restoredOldCustomerBalance =
        oldCustomer.balance - sale.total;

      await customerRepository.update(sale.customerId, {
        balance: restoredOldCustomerBalance,
        updatedAt: now,
      } as any, { queueSync: false } as any);

      // Restore old inventory.
      for (const item of sale.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Original product not found: ${item.productId}`);
        }

        await productRepository.update(item.productId, {
          quantity: product.quantity + item.quantity,
          weightKg: product.weightKg + item.weightKg,
          updatedAt: now,
        } as any, { queueSync: false } as any);
      }

      // Apply new inventory.
      for (const item of input.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        if (product.quantity < item.quantity) {
          throw new Error(
            `Insufficient product quantity: ${item.productId}`,
          );
        }

        if (product.weightKg < item.weightKg) {
          throw new Error(
            `Insufficient product weight: ${item.productId}`,
          );
        }

        await productRepository.update(item.productId, {
          quantity: product.quantity - item.quantity,
          weightKg: product.weightKg - item.weightKg,
          updatedAt: now,
        } as any, { queueSync: false } as any);
      }

      // Read the current balance after old-customer reversal.
      const currentNewCustomer = await db.customers.get(
        input.customerId,
      );

      if (!currentNewCustomer) {
        throw new Error("Customer not found.");
      }

      // Apply new customer balance.
      await customerRepository.update(input.customerId, {
        balance: currentNewCustomer.balance + input.total,
        updatedAt: now,
      } as any, { queueSync: false } as any);

      // Persist edited sale.
      await saleRepository.update(input.saleId, {
        customerId: input.customerId,
        date: input.date,
        items: input.items,
        total: input.total,
        updatedAt: now,
        syncStatus: "pending",
      });

      return saleRepository.getById(input.saleId);
    });
  }
}

export const saleEditOperation = new SaleEditOperation();
