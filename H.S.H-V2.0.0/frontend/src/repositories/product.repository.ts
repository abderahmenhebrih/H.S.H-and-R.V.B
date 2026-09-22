import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Product } from "../types/entities/product";

export class ProductRepository extends BaseRepository<Product> {
  constructor() {
    super(db.products, "product");
  }

  async getByName(name: string): Promise<Product | undefined> {
    return this.table.where("name").equals(name).first();
  }
}

export const productRepository = new ProductRepository();

