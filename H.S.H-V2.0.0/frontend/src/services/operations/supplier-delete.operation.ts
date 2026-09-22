import { db } from "../../lib/database/db";
import { supplierRepository } from "../../repositories/supplier.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class SupplierDeleteOperation {
  async delete(supplierId: string) {
    return runDatabaseTransaction(async () => {
      const supplier = await supplierRepository.getById(supplierId);

      if (!supplier) {
        throw new Error("Supplier not found.");
      }

      const purchases = await db.purchases
        .where("supplierId")
        .equals(supplierId)
        .toArray();

      if (purchases.length > 0) {
        throw new Error(
          "Cannot delete supplier because it is used in purchase history.",
        );
      }

      const payments = await db.payments
        .where("entityType")
        .equals("supplier")
        .toArray();

      const supplierPayments = payments.filter(
        (payment) => payment.entityId === supplierId,
      );

      if (supplierPayments.length > 0) {
        throw new Error(
          "Cannot delete supplier because it is used in payment history.",
        );
      }

      if (supplier.balance !== 0) {
        throw new Error(
          "Cannot delete supplier while the supplier balance is not zero.",
        );
      }

      await supplierRepository.delete(supplierId);
    });
  }
}

export const supplierDeleteOperation =
  new SupplierDeleteOperation();
