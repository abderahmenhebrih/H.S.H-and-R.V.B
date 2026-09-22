import { db } from "../../lib/database/db";
import { purchaseService } from "../purchase.service";
import { runDatabaseTransaction } from "./database-transaction";
import { productRepository } from "../../repositories/product.repository";
import { supplierRepository } from "../../repositories/supplier.repository";

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

      if (input.items.length === 0) {
        throw new Error("A purchase must contain at least one item.");
      }

      if (input.total < 0) {
        throw new Error("Purchase total cannot be negative.");
      }

      for (const item of input.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        await productRepository.update(item.productId, {
          quantity: product.quantity + item.quantity,
          weightKg: product.weightKg + item.weightKg,
        } as any);
      }

      const purchase = await purchaseService.create({
        supplierId: input.supplierId,
        date: input.date,
        items: input.items,
        total: input.total,
        calculation: input.calculation,
      });

      await supplierRepository.update(input.supplierId, {
        balance: supplier.balance + input.total,
      } as any);

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
