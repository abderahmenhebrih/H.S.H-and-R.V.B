import { db } from "../../lib/database/db";
import { productRepository } from "../../repositories/product.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class ProductEditOperation {
  async edit(input: {
    productId: string;
    name: string;
    price: number;
    quantity: number;
    weightKg: number;
    description?: string;
    taxProfileId?: string;
  }) {
    return runDatabaseTransaction(async () => {
      if (!input.name.trim()) {
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

      const product = await productRepository.getById(input.productId);

      if (!product) {
        throw new Error("Product not found.");
      }

      const all = await productRepository.getAll();
      const normalized = input.name.trim().toLowerCase();
      const existingNorm = all.find((p) => p.name.trim().toLowerCase() === normalized && p.id !== input.productId);
      if (existingNorm) {
        throw new Error("A product with this name already exists.");
      }

      const updatedAt = Date.now();

      const normalizedTaxProfileId = input.taxProfileId?.trim() ? input.taxProfileId.trim() : null;
      const changes: any = {
        name: input.name.trim(),
        price: input.price,
        quantity: input.quantity,
        weightKg: input.weightKg,
        description: input.description?.trim() || undefined,
        // Use null to explicitly clear old taxProfileId on server; undefined would be omitted in JSON and preserve old value
        taxProfileId: normalizedTaxProfileId,
        updatedAt,
        syncStatus: "pending" as const,
      };
      // When clearing (null), we must ensure Dexie stores null and sync payload contains null (not omitted)
      // Backend will $set taxProfileId to null, which is treated as "Not configured" (falsy) by tax resolver


      await productRepository.update(input.productId, changes);

      return productRepository.getById(input.productId);
    });
  }
}

export const productEditOperation = new ProductEditOperation();
