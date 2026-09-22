import { db } from "../../lib/database/db";
import { saleService } from "../sale.service";
import { runDatabaseTransaction } from "./database-transaction";
import { productRepository } from "../../repositories/product.repository";
import { customerRepository } from "../../repositories/customer.repository";

export class SaleOperation {
  async create(input: {
    customerId: string;
    date: number;
    items: Parameters<typeof saleService.create>[0]["items"];
    total: number;
  }) {
    return runDatabaseTransaction(async () => {
      const customer = await db.customers.get(input.customerId);

      if (!customer) {
        throw new Error("Customer not found.");
      }

      if (input.items.length === 0) {
        throw new Error("A sale must contain at least one item.");
      }

      if (input.total < 0) {
        throw new Error("Sale total cannot be negative.");
      }

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
        } as any);
      }

      const sale = await saleService.create({
        customerId: input.customerId,
        date: input.date,
        items: input.items,
        total: input.total,
      });

      await customerRepository.update(input.customerId, {
        balance: customer.balance + input.total,
      } as any);

      // Notification for sale (will sync, in-app only by default)
      try {
        const { notifySalePurchase } = await import("../notification-engine");
        const settings: any = await (await import("../settings.service")).settingsService.get();
        await notifySalePurchase({ id: sale.id, type: "sale", total: input.total, currency: settings?.currency ?? "DA" });
      } catch {}

      return sale;
    });
  }
}

export const saleOperation = new SaleOperation();
