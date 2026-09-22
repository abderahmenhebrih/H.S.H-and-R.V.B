import { db } from "../../lib/database/db";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class BankAccountDeleteOperation {
  async delete(accountId: string) {
    return runDatabaseTransaction(async () => {
      const account = await bankAccountRepository.getById(accountId);

      if (!account) {
        throw new Error("Bank account not found.");
      }

      const payments = await db.payments
        .where("accountId")
        .equals(accountId)
        .toArray();

      if (payments.length > 0) {
        throw new Error(
          "Cannot delete bank account because it is used in payment history.",
        );
      }

      const outgoingTransfers = await db.transfers
        .where("fromAccountId")
        .equals(accountId)
        .toArray();

      if (outgoingTransfers.length > 0) {
        throw new Error(
          "Cannot delete bank account because it is used in transfer history.",
        );
      }

      const incomingTransfers = await db.transfers
        .where("toAccountId")
        .equals(accountId)
        .toArray();

      if (incomingTransfers.length > 0) {
        throw new Error(
          "Cannot delete bank account because it is used in transfer history.",
        );
      }

      if (account.balance !== 0) {
        throw new Error(
          "Cannot delete bank account while the account balance is not zero.",
        );
      }

      await bankAccountRepository.delete(accountId);
    });
  }
}

export const bankAccountDeleteOperation =
  new BankAccountDeleteOperation();
