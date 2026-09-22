import { db } from "../../lib/database/db";
import { purchaseRepository } from "../../repositories/purchase.repository";
import { supplierRepository } from "../../repositories/supplier.repository";
import { productRepository } from "../../repositories/product.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class PurchaseEditOperation {
  async edit(input: {
    purchaseId: string;
    supplierId: string;
    date: number;
    items: {
      productId: string;
      quantity: number;
      weightKg: number;
      price: number;
      total: number;
    }[];
    total: number;
    calculation?: {
      weightBeforeSlaughterKg: number;
      weightAfterSlaughterKg: number;
      amount: number;
      averageWeightKg: number;
      averageLossPercent: number;
      averageLossKg: number;
    };
  }) {
    return runDatabaseTransaction(async () => {
      if (input.items.length === 0) {
        throw new Error("A purchase must contain at least one item.");
      }

      if (input.total < 0) {
        throw new Error("Purchase total cannot be negative.");
      }

      const purchase = await purchaseRepository.getById(input.purchaseId);

      if (!purchase) {
        throw new Error("Purchase not found.");
      }

      const oldSupplier = await db.suppliers.get(purchase.supplierId);

      if (!oldSupplier) {
        throw new Error("Original supplier not found.");
      }

      if (oldSupplier.balance < purchase.total) {
        throw new Error(
          "Cannot edit purchase because original supplier balance is insufficient.",
        );
      }

      const newSupplier = await db.suppliers.get(input.supplierId);

      if (!newSupplier) {
        throw new Error("Supplier not found.");
      }

      for (const item of purchase.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Original product not found: ${item.productId}`);
        }

        if (
          product.quantity < item.quantity ||
          product.weightKg < item.weightKg
        ) {
          throw new Error(
            `Cannot edit purchase inventory for product: ${item.productId}`,
          );
        }
      }

      for (const item of input.items) {
        if (item.quantity < 0) {
          throw new Error("Purchase quantity cannot be negative.");
        }

        if (item.weightKg < 0) {
          throw new Error("Purchase weight cannot be negative.");
        }

        if (item.price < 0) {
          throw new Error("Purchase price cannot be negative.");
        }

        if (item.total < 0) {
          throw new Error("Purchase item total cannot be negative.");
        }

        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
      }

      const now = Date.now();

      // Reverse original supplier balance.
      const restoredOldSupplierBalance =
        oldSupplier.balance - purchase.total;

      await supplierRepository.update(purchase.supplierId, {
        balance: restoredOldSupplierBalance,
        updatedAt: now,
      } as any);

      // Reverse original inventory.
      for (const item of purchase.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Original product not found: ${item.productId}`);
        }

        await productRepository.update(item.productId, {
          quantity: product.quantity - item.quantity,
          weightKg: product.weightKg - item.weightKg,
          updatedAt: now,
        } as any);
      }

      // Apply new inventory.
      for (const item of input.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        await productRepository.update(item.productId, {
          quantity: product.quantity + item.quantity,
          weightKg: product.weightKg + item.weightKg,
          updatedAt: now,
        } as any);
      }

      // Apply new supplier balance.
      const currentNewSupplier = await db.suppliers.get(input.supplierId);

      if (!currentNewSupplier) {
        throw new Error("Supplier not found.");
      }

      await supplierRepository.update(input.supplierId, {
        balance: currentNewSupplier.balance + input.total,
        updatedAt: now,
      } as any);

      await purchaseRepository.update(input.purchaseId, {
        supplierId: input.supplierId,
        date: input.date,
        items: input.items,
        total: input.total,
        calculation: input.calculation,
        updatedAt: now,
        syncStatus: "pending",
      });

      return purchaseRepository.getById(input.purchaseId);
    });
  }
}

export const purchaseEditOperation = new PurchaseEditOperation();
