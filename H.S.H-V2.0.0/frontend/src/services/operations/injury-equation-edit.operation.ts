import { db } from "../../lib/database/db";
import { injuryEquationRepository } from "../../repositories/injury-equation.repository";
import { productRepository } from "../../repositories/product.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class InjuryEquationEditOperation {
  async edit(input: {
    injuryEquationId: string;
    productId: string;
    name: string;
    equation: string;
    enabled: boolean;
  }) {
    return runDatabaseTransaction(async () => {
      if (!input.name.trim()) {
        throw new Error("Injury equation name is required.");
      }

      if (!input.equation.trim()) {
        throw new Error("Injury equation is required.");
      }

      const injuryEquation = await injuryEquationRepository.getById(
        input.injuryEquationId,
      );

      if (!injuryEquation) {
        throw new Error("Injury equation not found.");
      }

      const product = await productRepository.getById(input.productId);

      if (!product) {
        throw new Error("Product not found.");
      }

      await injuryEquationRepository.update(input.injuryEquationId, {
        productId: input.productId,
        name: input.name,
        inputVariable: "A",
        outputVariable: "B",
        equation: input.equation,
        enabled: input.enabled,
        updatedAt: Date.now(),
        syncStatus: "pending",
      });

      return db.injuryEquations.get(input.injuryEquationId);
    });
  }
}

export const injuryEquationEditOperation =
  new InjuryEquationEditOperation();
