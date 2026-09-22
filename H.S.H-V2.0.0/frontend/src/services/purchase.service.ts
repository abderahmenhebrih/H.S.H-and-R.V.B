import { generateId } from "../lib/id";
import { purchaseRepository } from "../repositories/purchase.repository";
import type { Purchase } from "../types/entities/purchase";
import { BaseService } from "./base.service";

export class PurchaseService extends BaseService {
  async create(input: {
    supplierId: string;
    date: number;
    items: Purchase["items"];
    total: number;
    calculation?: Purchase["calculation"];
  }): Promise<Purchase> {
    if (input.items.length === 0) {
      throw new Error("A purchase must contain at least one item.");
    }

    if (input.total < 0) {
      throw new Error("Purchase total cannot be negative.");
    }

    const now = Date.now();

    const purchase: Purchase = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      supplierId: input.supplierId,
      date: input.date,
      items: input.items,
      total: input.total,
      calculation: input.calculation,
    };

    await purchaseRepository.create(purchase);

    return purchase;
  }

  async getById(id: string): Promise<Purchase | undefined> {
    this.assertValidId(id, "Purchase");
    return purchaseRepository.getById(id);
  }

  async getAll(): Promise<Purchase[]> {
    return purchaseRepository.getAll();
  }

  async getBySupplierId(supplierId: string): Promise<Purchase[]> {
    this.assertValidId(supplierId, "Supplier");
    return purchaseRepository.getBySupplierId(supplierId);
  }

  async getByDateRange(from: number, to: number): Promise<Purchase[]> {
    return purchaseRepository.getByDateRange(from, to);
  }

  async migrateLegacyPurchases(): Promise<void> {
    const all = await purchaseRepository.getAll();
    for (const purchase of all) {
      if (purchase.items.length > 1) {
        for (let i = 1; i < purchase.items.length; i++) {
          const item = purchase.items[i];
          const newPurchase: Purchase = {
            id: generateId(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            syncStatus: "pending",
            supplierId: purchase.supplierId,
            date: purchase.date,
            items: [item],
            total: item.total,
          };
          await purchaseRepository.create(newPurchase);
        }
        const firstItem = purchase.items[0];
        await purchaseRepository.update(purchase.id, {
          items: [firstItem],
          total: firstItem.total,
          updatedAt: Date.now(),
        } as Partial<Purchase> as any);
      }
    }
  }
}

export const purchaseService = new PurchaseService();
