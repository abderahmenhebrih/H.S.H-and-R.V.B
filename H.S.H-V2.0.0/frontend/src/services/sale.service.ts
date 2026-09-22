import { generateId } from "../lib/id";
import { saleRepository } from "../repositories/sale.repository";
import type { Sale } from "../types/entities/sale";
import { BaseService } from "./base.service";

export class SaleService extends BaseService {
  async create(input: {
    customerId: string;
    date: number;
    items: Sale["items"];
    total: number;
  }): Promise<Sale> {
    if (input.items.length === 0) {
      throw new Error("A sale must contain at least one item.");
    }

    if (input.total < 0) {
      throw new Error("Sale total cannot be negative.");
    }

    const now = Date.now();

    const sale: Sale = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      customerId: input.customerId,
      date: input.date,
      items: input.items,
      total: input.total,
    };

    await saleRepository.create(sale);

    return sale;
  }

  async getById(id: string): Promise<Sale | undefined> {
    this.assertValidId(id, "Sale");
    return saleRepository.getById(id);
  }

  async getAll(): Promise<Sale[]> {
    return saleRepository.getAll();
  }

  async getByCustomerId(customerId: string): Promise<Sale[]> {
    this.assertValidId(customerId, "Customer");
    return saleRepository.getByCustomerId(customerId);
  }

  async getByDateRange(from: number, to: number): Promise<Sale[]> {
    return saleRepository.getByDateRange(from, to);
  }
}

export const saleService = new SaleService();
