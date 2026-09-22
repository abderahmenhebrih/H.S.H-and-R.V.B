import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { bankAccountService } from "../frontend/src/services/bank-account.service";
import { bankAccountDeleteOperation } from "../frontend/src/services/operations/bank-account-delete.operation";
import { transferOperation } from "../frontend/src/services/operations/transfer.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const account = await bankAccountService.create({
    type: "cash",
    name: `__TEST_ACCOUNT_DELETE_${now}__`,
    initialBalance: 0,
  });

  await bankAccountDeleteOperation.delete(account.id);

  const deleted = await db.bankAccounts.get(account.id);

  if (deleted) {
    throw new Error("Bank account was not deleted.");
  }

  console.log("Bank account deletion passed.");

  const balanceAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_ACCOUNT_DELETE_BALANCE_${now}__`,
    initialBalance: 1000,
  });

  try {
    await bankAccountDeleteOperation.delete(balanceAccount.id);

    throw new Error("Account with non-zero balance was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete bank account while the account balance is not zero."
    ) {
      console.log("Bank account balance protection passed.");
    } else {
      throw error;
    }
  }

  const transferFromAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_ACCOUNT_DELETE_FROM_${now}__`,
    initialBalance: 1000,
  });

  const transferToAccount = await bankAccountService.create({
    type: "bank",
    name: `__TEST_ACCOUNT_DELETE_TO_${now}__`,
    initialBalance: 0,
  });

  const transfer = await transferOperation.create({
    fromAccountId: transferFromAccount.id,
    toAccountId: transferToAccount.id,
    amount: 500,
    date: now,
  });

  try {
    await bankAccountDeleteOperation.delete(transferFromAccount.id);

    throw new Error("Account used in outgoing transfer was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete bank account because it is used in transfer history."
    ) {
      console.log("Outgoing transfer protection passed.");
    } else {
      throw error;
    }
  }

  try {
    await bankAccountDeleteOperation.delete(transferToAccount.id);

    throw new Error("Account used in incoming transfer was deleted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot delete bank account because it is used in transfer history."
    ) {
      console.log("Incoming transfer protection passed.");
    } else {
      throw error;
    }
  }

  const transferStillThere = await db.transfers.get(transfer.id);

  if (!transferStillThere) {
    throw new Error("Failed account deletion removed the transfer.");
  }

  try {
    await bankAccountDeleteOperation.delete(
      "__NON_EXISTENT_ACCOUNT__",
    );

    throw new Error("Missing account was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Bank account not found."
    ) {
      console.log("Missing account rejection passed.");
    } else {
      throw error;
    }
  }

  const stillThere = await db.bankAccounts.get(transferFromAccount.id);

  if (!stillThere) {
    throw new Error("Failed account deletion removed the account.");
  }

  console.log("Bank account delete protection passed.");
  console.log("Bank account delete operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Bank account delete operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

