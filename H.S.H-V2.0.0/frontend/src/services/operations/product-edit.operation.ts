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

      if (input.price < 0) {
        throw new Error("Product price cannot be negative.");
      }

      if (input.quantity < 0) {
        throw new Error("Product quantity cannot be negative.");
      }

      if (input.weightKg < 0) {
        throw new Error("Product weight cannot be negative.");
      }

      const product = await productRepository.getById(input.productId);

      if (!product) {
        throw new Error("Product not found.");
      }

      const existing = await productRepository.getByName(input.name);

      if (existing && existing.id !== input.productId) {
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
