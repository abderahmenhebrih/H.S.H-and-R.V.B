import { db } from "../../lib/database/db";
import { purchaseRepository } from "../../repositories/purchase.repository";
import { supplierRepository } from "../../repositories/supplier.repository";
import { productRepository } from "../../repositories/product.repository";
import { runDatabaseTransaction } from "./database-transaction";
import { roundMoney } from "../../lib/money";

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

      if (!Number.isFinite(input.total) || input.total < 0) {
        throw new Error("Purchase total must be a finite number >= 0.");
      }
      if (!Number.isFinite(input.date)) {
        throw new Error("Purchase date must be a valid finite timestamp.");
      }

      const purchase = await purchaseRepository.getById(input.purchaseId);

      if (!purchase) {
        throw new Error("Purchase not found.");
      }

      const oldSupplier = await db.suppliers.get(purchase.supplierId);

      if (!oldSupplier) {
        throw new Error("Original supplier not found.");
      }
      if (!Number.isFinite(oldSupplier.balance) || !Number.isFinite(purchase.total)) {
        throw new Error("Supplier balance corrupted.");
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
      if (!Number.isFinite(newSupplier.balance)) {
        throw new Error("Supplier balance corrupted.");
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

      let canonicalTotal = 0;
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
        const expected = roundMoney(item.weightKg * item.price);
        if (Math.abs(item.total - expected) > 0.005) {
          throw new Error(`Item total mismatch for ${item.productId}: expected ${expected}, got ${item.total}`);
        }
        canonicalTotal = roundMoney(canonicalTotal + expected);

        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        if (!Number.isFinite(product.quantity) || !Number.isFinite(product.weightKg)) {
          throw new Error(`Product balance corrupted: ${item.productId}`);
        }
      }
      if (Math.abs(input.total - canonicalTotal) > 0.005) {
        throw new Error(`Purchase total mismatch: expected ${canonicalTotal}, got ${input.total}`);
      }

      const now = Date.now();

      // Reverse original supplier balance.
      const restoredOldSupplierBalance = roundMoney(
        oldSupplier.balance - purchase.total,
      );

      await supplierRepository.update(purchase.supplierId, {
        balance: restoredOldSupplierBalance,
        updatedAt: now,
      } as any, { queueSync: false } as any);

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
        } as any, { queueSync: false } as any);
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
        } as any, { queueSync: false } as any);
      }

      // Apply new supplier balance.
      const currentNewSupplier = await db.suppliers.get(input.supplierId);

      if (!currentNewSupplier) {
        throw new Error("Supplier not found.");
      }
      if (!Number.isFinite(currentNewSupplier.balance)) {
        throw new Error("Supplier balance corrupted.");
      }

      await supplierRepository.update(input.supplierId, {
        balance: roundMoney(currentNewSupplier.balance + canonicalTotal),
        updatedAt: now,
      } as any, { queueSync: false } as any);

      await purchaseRepository.update(input.purchaseId, {
        supplierId: input.supplierId,
        date: input.date,
        items: input.items,
        total: canonicalTotal,
        calculation: input.calculation,
        updatedAt: now,
        syncStatus: "pending",
      });

      return purchaseRepository.getById(input.purchaseId);
    });
  }
}

export const purchaseEditOperation = new PurchaseEditOperation();
