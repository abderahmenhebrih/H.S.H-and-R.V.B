import { db } from "../../lib/database/db";
import { supplierRepository } from "../../repositories/supplier.repository";
import { productRepository } from "../../repositories/product.repository";
import { purchaseRepository } from "../../repositories/purchase.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class PurchaseReversalOperation {
  async delete(purchaseId: string) {
    return runDatabaseTransaction(async () => {
      const purchase = await purchaseRepository.getById(purchaseId);

      if (!purchase) {
        throw new Error("Purchase not found.");
      }

      const supplier = await db.suppliers.get(purchase.supplierId);

      if (!supplier) {
        throw new Error("Supplier not found.");
      }

      for (const item of purchase.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        if (
          product.quantity < item.quantity ||
          product.weightKg < item.weightKg
        ) {
          throw new Error(
            `Cannot reverse purchase inventory for product: ${item.productId}`,
          );
        }
      }

      if (supplier.balance < purchase.total) {
        throw new Error(
          "Cannot reverse purchase because supplier balance is insufficient.",
        );
      }

      const now = Date.now();

      for (const item of purchase.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        await productRepository.update(item.productId, {
          quantity: product.quantity - item.quantity,
          weightKg: product.weightKg - item.weightKg,
          updatedAt: now,
          });
      }

      await supplierRepository.update(purchase.supplierId, {
        balance: supplier.balance - purchase.total,
        updatedAt: now,
        });

      await purchaseRepository.delete(purchaseId);
    });
  }
}

export const purchaseReversalOperation =
  new PurchaseReversalOperation();
