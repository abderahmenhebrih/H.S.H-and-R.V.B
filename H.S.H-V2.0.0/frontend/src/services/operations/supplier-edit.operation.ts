import { db } from "../../lib/database/db";
import { supplierRepository } from "../../repositories/supplier.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class SupplierEditOperation {
  async edit(input: {
    supplierId: string;
    name: string;
    phone: string;
    address?: string;
    identificationNumber?: string;
    email?: string;
    notes?: string;
  }) {
    return runDatabaseTransaction(async () => {
      if (!input.name.trim()) {
        throw new Error("Supplier name is required.");
      }

      if (!input.phone.trim()) {
        throw new Error("Supplier phone is required.");
      }

      const supplier = await supplierRepository.getById(input.supplierId);

      if (!supplier) {
        throw new Error("Supplier not found.");
      }

      const existing = await supplierRepository.getByName(input.name);

      if (existing && existing.id !== input.supplierId) {
        throw new Error("A supplier with this name already exists.");
      }

      await supplierRepository.update(input.supplierId, {
        name: input.name,
        phone: input.phone,
        address: input.address,
        identificationNumber: input.identificationNumber,
        email: input.email,
        notes: input.notes,
        updatedAt: Date.now(),
        syncStatus: "pending",
      });

      return db.suppliers.get(input.supplierId);
    });
  }
}

export const supplierEditOperation = new SupplierEditOperation();
