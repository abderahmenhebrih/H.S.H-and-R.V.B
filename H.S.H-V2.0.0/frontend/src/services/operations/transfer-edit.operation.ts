import { db } from "../../lib/database/db";
import { transferRepository } from "../../repositories/transfer.repository";
import { bankAccountRepository } from "../../repositories/bank-account.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class TransferEditOperation {
  async edit(input: {
    transferId: string;
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    date: number;
    note?: string;
  }) {
    return runDatabaseTransaction(async () => {
      if (input.amount <= 0) {
        throw new Error("Transfer amount must be greater than zero.");
      }

      if (input.fromAccountId === input.toAccountId) {
        throw new Error(
          "Source and destination accounts must be different.",
        );
      }

      const transfer = await transferRepository.getById(input.transferId);

      if (!transfer) {
        throw new Error("Transfer not found.");
      }

      const oldSource = await db.bankAccounts.get(
        transfer.fromAccountId,
      );

      if (!oldSource) {
        throw new Error("Original source account not found.");
      }

      const oldDestination = await db.bankAccounts.get(
        transfer.toAccountId,
      );

      if (!oldDestination) {
        throw new Error("Original destination account not found.");
      }

      /*
       * Start from the balances that exist after reversing
       * the original transfer.
       */
      const balances = new Map<string, number>();

      balances.set(
        transfer.fromAccountId,
        oldSource.balance + transfer.amount,
      );

      balances.set(
        transfer.toAccountId,
        oldDestination.balance - transfer.amount,
      );

      /*
       * Make sure the new source and destination exist.
       */
      const newSource = await db.bankAccounts.get(
        input.fromAccountId,
      );

      if (!newSource) {
        throw new Error("Source account not found.");
      }

      const newDestination = await db.bankAccounts.get(
        input.toAccountId,
      );

      if (!newDestination) {
        throw new Error("Destination account not found.");
      }

      /*
       * If an account wasn't involved in the original transfer,
       * its current database balance is the starting balance.
       */
      if (!balances.has(input.fromAccountId)) {
        balances.set(
          input.fromAccountId,
          newSource.balance,
        );
      }

      if (!balances.has(input.toAccountId)) {
        balances.set(
          input.toAccountId,
          newDestination.balance,
        );
      }

      const sourceBalance = balances.get(input.fromAccountId)!;

      if (sourceBalance < input.amount) {
        throw new Error("Insufficient source account balance.");
      }

      /*
       * Apply the new transfer to the restored balances.
       */
      balances.set(
        input.fromAccountId,
        sourceBalance - input.amount,
      );

      balances.set(
        input.toAccountId,
        balances.get(input.toAccountId)! + input.amount,
      );

      const now = Date.now();

      /*
       * Update every account affected by either the old or new
       * transfer exactly once.
       */
      const affectedAccountIds = new Set<string>([
        transfer.fromAccountId,
        transfer.toAccountId,
        input.fromAccountId,
        input.toAccountId,
      ]);

      for (const accountId of affectedAccountIds) {
        const balance = balances.get(accountId);

        if (balance === undefined) {
          throw new Error("Account not found.");
        }

        await bankAccountRepository.update(accountId, {
          balance,
          updatedAt: now,
        } as any);
      }

      await transferRepository.update(input.transferId, {
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amount: input.amount,
        date: input.date,
        note: input.note,
        updatedAt: now,
        syncStatus: "pending",
      });

      return transferRepository.getById(input.transferId);
    });
  }
}

export const transferEditOperation =
  new TransferEditOperation();
