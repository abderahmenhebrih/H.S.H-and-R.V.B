import { db } from "../../lib/database/db";
import { productRepository } from "../../repositories/product.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class ProductDeleteOperation {
  async delete(productId: string) {
    return runDatabaseTransaction(async () => {
      const product = await productRepository.getById(productId);

      if (!product) {
        throw new Error("Product not found.");
      }

      const purchases = await db.purchases.toArray();

      const usedInPurchase = purchases.some((purchase) =>
        purchase.items.some((item) => item.productId === productId),
      );

      if (usedInPurchase) {
        throw new Error(
          "Cannot delete product because it is used in purchase history.",
        );
      }

      const sales = await db.sales.toArray();

      const usedInSale = sales.some((sale) =>
        sale.items.some((item) => item.productId === productId),
      );

      if (usedInSale) {
        throw new Error(
          "Cannot delete product because it is used in sale history.",
        );
      }

      const injuryEquations = await db.injuryEquations
        .where("productId")
        .equals(productId)
        .toArray();

      if (injuryEquations.length > 0) {
        throw new Error(
          "Cannot delete product because it is used by an injury equation.",
        );
      }

      await productRepository.delete(productId);
    });
  }
}

export const productDeleteOperation = new ProductDeleteOperation();
