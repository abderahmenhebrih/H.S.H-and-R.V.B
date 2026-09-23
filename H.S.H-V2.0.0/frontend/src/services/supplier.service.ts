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
    const trimmedName = input.name?.trim();
    if (!trimmedName) {
      throw new Error("Supplier name is required.");
    }
    const trimmedPhone = input.phone?.trim();
    if (!trimmedPhone) {
      throw new Error("Supplier phone is required.");
    }
    // Preserve raw value (+, spaces, dashes allowed) — do not strip silently
    if (!/^\+?[0-9\s\-]+$/.test(trimmedPhone)) {
      throw new Error("Invalid phone number. Phone may contain +, digits, spaces and dashes only.");
    }

    const existing = await supplierRepository.getByName(trimmedName);

    if (existing) {
      throw new Error("A supplier with this name already exists.");
    }

    const now = Date.now();

    const supplier: Supplier = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: trimmedName,
      phone: trimmedPhone,
      address: input.address?.trim() || undefined,
      identificationNumber: input.identificationNumber?.trim() || undefined,
      email: input.email?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
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
