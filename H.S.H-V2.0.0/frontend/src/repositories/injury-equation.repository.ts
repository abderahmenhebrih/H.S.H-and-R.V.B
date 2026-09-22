import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { InjuryEquation } from "../types/entities/injury-equation";

export class InjuryEquationRepository extends BaseRepository<InjuryEquation> {
  constructor() {
    super(db.injuryEquations, "injuryEquation");
  }

  async getByProductId(productId: string): Promise<InjuryEquation[]> {
    return this.table.where("productId").equals(productId).toArray();
  }

  async getEnabled(): Promise<InjuryEquation[]> {
    return this.table.where("enabled").equals(1).toArray();
  }
}

export const injuryEquationRepository = new InjuryEquationRepository();

