import { db } from "../../lib/database/db";
import { saleService } from "../sale.service";
import { runDatabaseTransaction } from "./database-transaction";
import { productRepository } from "../../repositories/product.repository";
import { customerRepository } from "../../repositories/customer.repository";
import { roundMoney } from "../../lib/money";

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

      if (!Number.isFinite(input.total) || input.total < 0) {
        throw new Error("Sale total must be a finite number >= 0.");
      }
      if (!Number.isFinite(input.date)) {
        throw new Error("Sale date must be a valid finite timestamp.");
      }

      if (input.items.length === 0) {
        throw new Error("A sale must contain at least one item.");
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
      }
      if (Math.abs(input.total - canonicalTotal) > 0.005) {
        throw new Error(`Sale total mismatch: expected ${canonicalTotal}, got ${input.total}`);
      }

      if (!Number.isFinite(customer.balance)) {
        throw new Error("Customer balance corrupted.");
      }

      for (const item of input.items) {
        const product = await db.products.get(item.productId);

        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        if (!Number.isFinite(product.quantity) || !Number.isFinite(product.weightKg)) {
          throw new Error(`Product balance corrupted: ${item.productId}`);
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
        } as any, { queueSync: false } as any);
      }

      const sale = await saleService.create({
        customerId: input.customerId,
        date: input.date,
        items: input.items,
        total: canonicalTotal,
      });

      await customerRepository.update(input.customerId, {
        balance: roundMoney(customer.balance + canonicalTotal),
      } as any, { queueSync: false } as any);

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
