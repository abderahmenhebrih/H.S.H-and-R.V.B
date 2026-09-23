import { generateId } from "../lib/id";
import { productRepository } from "../repositories/product.repository";
import type { Product } from "../types/entities/product";
import { runDatabaseTransaction } from "./operations/database-transaction";
import { BaseService } from "./base.service";

export class ProductService extends BaseService {
  async create(input: {
    name: string;
    price: number;
    quantity: number;
    weightKg: number;
    description?: string;
    taxProfileId?: string;
  }): Promise<Product> {
    return runDatabaseTransaction(async () => {
      const trimmedName = input.name.trim();
      const normalized = trimmedName.toLowerCase();
      const all = await productRepository.getAll();
      const existingNorm = all.find((p) => p.name.trim().toLowerCase() === normalized);
      if (existingNorm) {
        throw new Error("A product with this name already exists.");
      }

      if (!trimmedName) {
        throw new Error("Product name is required.");
      }

      if (!Number.isFinite(input.price) || input.price < 0) {
        throw new Error("Product price must be a finite number >= 0.");
      }

      if (!Number.isFinite(input.quantity) || input.quantity < 0 || !Number.isInteger(input.quantity)) {
        throw new Error("Product quantity must be a finite integer >= 0.");
      }

      if (!Number.isFinite(input.weightKg) || input.weightKg < 0) {
        throw new Error("Product weight must be a finite number >= 0.");
      }

      const now = Date.now();

      const product: Product = {
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        syncStatus: "pending",
        name: input.name.trim(),
        price: input.price,
        quantity: input.quantity,
        weightKg: input.weightKg,
        description: input.description?.trim() || undefined,
        taxProfileId: input.taxProfileId?.trim() || undefined,
      };

      await productRepository.create(product);

      return product;
    });
  }

  async getById(id: string): Promise<Product | undefined> {
    this.assertValidId(id, "Product");
    return productRepository.getById(id);
  }

  async getAll(): Promise<Product[]> {
    return productRepository.getAll();
  }
}

export const productService = new ProductService();
