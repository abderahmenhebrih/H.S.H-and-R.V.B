import { generateId } from "../lib/id";
import { supplierRepository } from "../repositories/supplier.repository";
import type { Supplier } from "../types/entities/supplier";
import { BaseService } from "./base.service";

export class SupplierService extends BaseService {
  async create(input: {
    name: string;
    phone: string;
    address?: string;
    identificationNumber?: string;
    email?: string;
    notes?: string;
  }): Promise<Supplier> {
    const existing = await supplierRepository.getByName(input.name);

    if (existing) {
      throw new Error("A supplier with this name already exists.");
    }

    const now = Date.now();

    const supplier: Supplier = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: input.name,
      phone: input.phone,
      address: input.address,
      identificationNumber: input.identificationNumber,
      email: input.email,
      notes: input.notes,
      balance: 0,
    };

    await supplierRepository.create(supplier);

    return supplier;
  }

  async getById(id: string): Promise<Supplier | undefined> {
    this.assertValidId(id, "Supplier");
    return supplierRepository.getById(id);
  }

  async getAll(): Promise<Supplier[]> {
    return supplierRepository.getAll();
  }
}

export const supplierService = new SupplierService();
