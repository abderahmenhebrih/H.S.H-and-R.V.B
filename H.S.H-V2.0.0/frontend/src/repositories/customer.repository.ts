import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Customer } from "../types/entities/customer";

export class CustomerRepository extends BaseRepository<Customer> {
  constructor() {
    super(db.customers, "customer");
  }

  async getByName(name: string): Promise<Customer | undefined> {
    return this.table.where("name").equals(name).first();
  }
}

export const customerRepository = new CustomerRepository();

