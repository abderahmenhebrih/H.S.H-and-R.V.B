import { generateId } from "../lib/id";
import { injuryEquationRepository } from "../repositories/injury-equation.repository";
import type { InjuryEquation } from "../types/entities/injury-equation";
import { BaseService } from "./base.service";

export class InjuryEquationService extends BaseService {
  async create(input: {
    productId: string;
    name: string;
    equation: string;
    enabled?: boolean;
  }): Promise<InjuryEquation> {
    this.assertValidId(input.productId, "Product");

    if (!input.name.trim()) {
      throw new Error("Injury equation name is required.");
    }

    if (!input.equation.trim()) {
      throw new Error("Injury equation is required.");
    }

    const now = Date.now();

    const equation: InjuryEquation = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      productId: input.productId,
      name: input.name,
      inputVariable: "A",
      outputVariable: "B",
      equation: input.equation,
      enabled: input.enabled ?? true,
    };

    await injuryEquationRepository.create(equation);

    return equation;
  }

  async delete(id: string): Promise<void> {
    this.assertValidId(id, "Injury equation");
    await injuryEquationRepository.delete(id);
  }

  async getById(id: string): Promise<InjuryEquation | undefined> {
    this.assertValidId(id, "Injury equation");
    return injuryEquationRepository.getById(id);
  }

  async getAll(): Promise<InjuryEquation[]> {
    return injuryEquationRepository.getAll();
  }

  async getByProductId(productId: string): Promise<InjuryEquation[]> {
    this.assertValidId(productId, "Product");
    return injuryEquationRepository.getByProductId(productId);
  }

  async getEnabled(): Promise<InjuryEquation[]> {
    return injuryEquationRepository.getEnabled();
  }
}

export const injuryEquationService = new InjuryEquationService();
