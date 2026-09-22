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
      const existing = await productRepository.getByName(input.name);

      if (existing) {
        throw new Error("A product with this name already exists.");
      }

      if (!input.name.trim()) {
        throw new Error("Product name is required.");
      }

      if (input.price < 0) {
        throw new Error("Product price cannot be negative.");
      }

      if (input.quantity < 0) {
        throw new Error("Product quantity cannot be negative.");
      }

      if (input.weightKg < 0) {
        throw new Error("Product weight cannot be negative.");
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
