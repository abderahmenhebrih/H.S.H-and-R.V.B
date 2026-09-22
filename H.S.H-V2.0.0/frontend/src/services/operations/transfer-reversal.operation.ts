import { db } from "../../lib/database/db";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { transferRepository } from "../../repositories/transfer.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class TransferReversalOperation {
  async delete(transferId: string) {
    return runDatabaseTransaction(async () => {
      const transfer = await transferRepository.getById(transferId);

      if (!transfer) {
        throw new Error("Transfer not found.");
      }

      const sourceAccount = await db.bankAccounts.get(
        transfer.fromAccountId,
      );

      if (!sourceAccount) {
        throw new Error("Source account not found.");
      }

      const destinationAccount = await db.bankAccounts.get(
        transfer.toAccountId,
      );

      if (!destinationAccount) {
        throw new Error("Destination account not found.");
      }

      if (destinationAccount.balance < transfer.amount) {
        throw new Error(
          "Cannot reverse transfer because destination account balance is insufficient.",
        );
      }

      const now = Date.now();

      await bankAccountRepository.update(transfer.fromAccountId, {
        balance: sourceAccount.balance + transfer.amount,
        updatedAt: now,
        });

      await bankAccountRepository.update(transfer.toAccountId, {
        balance: destinationAccount.balance - transfer.amount,
        updatedAt: now,
        });

      await transferRepository.delete(transferId);
    });
  }
}

export const transferReversalOperation =
  new TransferReversalOperation();
