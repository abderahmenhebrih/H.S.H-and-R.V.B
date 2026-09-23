import { db } from "../../lib/database/db";
import { purchaseService } from "../purchase.service";
import { runDatabaseTransaction } from "./database-transaction";
import { productRepository } from "../../repositories/product.repository";
import { supplierRepository } from "../../repositories/supplier.repository";
import { roundMoney } from "../../lib/money";

export class PurchaseOperation {
  async create(input: {
    supplierId: string;
    date: number;
    items: Parameters<typeof purchaseService.create>[0]["items"];
    total: number;
    calculation?: Parameters<
      typeof purchaseService.create
    >[0]["calculation"];
  }) {
    return runDatabaseTransaction(async () => {
      const supplier = await db.suppliers.get(input.supplierId);

      if (!supplier) {
        throw new Error("Supplier not found.");
      }

      if (!Number.isFinite(input.total) || input.total < 0) {
        throw new Error("Purchase total must be a finite number >= 0.");
      }
      if (!Number.isFinite(input.date)) {
        throw new Error("Purchase date must be a valid finite timestamp.");
      }

      if (input.items.length === 0) {
        throw new Error("A purchase must contain at least one item.");
      }

      // Validate and recompute canonical total (per-line rounding)
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
      }
      if (Math.abs(input.total - canonicalTotal) > 0.005) {
        throw new Error(`Purchase total mismatch: expected ${canonicalTotal}, got ${input.total}`);
      }

      for (const item of input.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        if (!Number.isFinite(product.quantity) || !Number.isFinite(product.weightKg)) {
          throw new Error(`Product balance corrupted: ${item.productId}`);
        }

        await productRepository.update(item.productId, {
          quantity: product.quantity + item.quantity,
          weightKg: product.weightKg + item.weightKg,
        } as any, { queueSync: false } as any);
      }

      if (!Number.isFinite(supplier.balance)) {
        throw new Error("Supplier balance corrupted.");
      }

      const purchase = await purchaseService.create({
        supplierId: input.supplierId,
        date: input.date,
        items: input.items,
        total: canonicalTotal,
        calculation: input.calculation,
      });

      await supplierRepository.update(input.supplierId, {
        balance: roundMoney(supplier.balance + canonicalTotal),
      } as any, { queueSync: false } as any);

      try {
        const { notifySalePurchase } = await import("../notification-engine");
        const settings: any = await (await import("../settings.service")).settingsService.get();
        await notifySalePurchase({ id: purchase.id, type: "purchase", total: input.total, currency: settings?.currency ?? "DA" });
      } catch {}

      return purchase;
    });
  }
}

export const purchaseOperation = new PurchaseOperation();
