import { db } from "../../lib/database/db";
import { customerRepository } from "../../repositories/customer.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class CustomerDeleteOperation {
  async delete(customerId: string) {
    return runDatabaseTransaction(async () => {
      const customer = await customerRepository.getById(customerId);

      if (!customer) {
        throw new Error("Customer not found.");
      }

      const sales = await db.sales
        .where("customerId")
        .equals(customerId)
        .toArray();

      if (sales.length > 0) {
        throw new Error(
          "Cannot delete customer because it is used in sale history.",
        );
      }

      const payments = await db.payments
        .where("entityType")
        .equals("customer")
        .toArray();

      const customerPayments = payments.filter(
        (payment) => payment.entityId === customerId,
      );

      if (customerPayments.length > 0) {
        throw new Error(
          "Cannot delete customer because it is used in payment history.",
        );
      }

      if (customer.balance !== 0) {
        throw new Error(
          "Cannot delete customer while the customer balance is not zero.",
        );
      }

      await customerRepository.delete(customerId);
    });
  }
}

export const customerDeleteOperation =
  new CustomerDeleteOperation();
