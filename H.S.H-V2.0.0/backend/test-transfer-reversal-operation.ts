import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { bankAccountService } from "../frontend/src/services/bank-account.service";
import { transferOperation } from "../frontend/src/services/operations/transfer.operation";
import { transferReversalOperation } from "../frontend/src/services/operations/transfer-reversal.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const sourceAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_REVERSAL_SOURCE_${now}__`,
    initialBalance: 10000,
  });

  const destinationAccount = await bankAccountService.create({
    type: "bank",
    name: `__TEST_REVERSAL_DESTINATION_${now}__`,
    initialBalance: 5000,
  });

  // Create transfer.
  const transfer = await transferOperation.create({
    fromAccountId: sourceAccount.id,
    toAccountId: destinationAccount.id,
    amount: 2000,
    date: now,
    note: "Original transfer",
  });

  let currentSource = await db.bankAccounts.get(
    sourceAccount.id,
  );

  let currentDestination = await db.bankAccounts.get(
    destinationAccount.id,
  );

  if (
    !currentSource ||
    !currentDestination ||
    currentSource.balance !== 8000 ||
    currentDestination.balance !== 7000
  ) {
    throw new Error("Initial transfer setup failed.");
  }

  console.log("Initial transfer setup passed.");

  // Successful reversal.
  await transferReversalOperation.delete(transfer.id);

  currentSource = await db.bankAccounts.get(sourceAccount.id);
  currentDestination = await db.bankAccounts.get(
    destinationAccount.id,
  );

  const deletedTransfer = await db.transfers.get(transfer.id);

  if (
    !currentSource ||
    !currentDestination ||
    currentSource.balance !== 10000 ||
    currentDestination.balance !== 5000 ||
    deletedTransfer
  ) {
    throw new Error("Transfer reversal accounting failed.");
  }

  console.log("Transfer reversal accounting passed.");

  // Missing transfer.
  try {
    await transferReversalOperation.delete(
      "__NON_EXISTENT_TRANSFER__",
    );

    throw new Error("Missing transfer was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Transfer not found."
    ) {
      console.log("Missing transfer rejection passed.");
    } else {
      throw error;
    }
  }

  // Create another transfer for balance protection.
  const protectedTransfer = await transferOperation.create({
    fromAccountId: sourceAccount.id,
    toAccountId: destinationAccount.id,
    amount: 4000,
    date: now + 1,
    note: "Protected transfer",
  });

  currentSource = await db.bankAccounts.get(sourceAccount.id);
  currentDestination = await db.bankAccounts.get(
    destinationAccount.id,
  );

  if (
    !currentSource ||
    !currentDestination ||
    currentSource.balance !== 6000 ||
    currentDestination.balance !== 9000
  ) {
    throw new Error(
      "Transfer balance-protection setup failed.",
    );
  }

  // Remove funds from destination so it can no longer cover
  // the original transfer reversal.
  await db.bankAccounts.update(destinationAccount.id, {
    balance: 3000,
  });

  const sourceBeforeFailure = await db.bankAccounts.get(
    sourceAccount.id,
  );

  const destinationBeforeFailure = await db.bankAccounts.get(
    destinationAccount.id,
  );

  if (
    !sourceBeforeFailure ||
    !destinationBeforeFailure
  ) {
    throw new Error(
      "Transfer balance-protection state setup failed.",
    );
  }

  try {
    await transferReversalOperation.delete(
      protectedTransfer.id,
    );

    throw new Error(
      "Transfer with insufficient destination balance was reversed.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot reverse transfer because destination account balance is insufficient."
    ) {
      console.log(
        "Transfer reversal balance protection passed.",
      );
    } else {
      throw error;
    }
  }

  // Failed reversal must not modify either account.
  const sourceAfterFailure = await db.bankAccounts.get(
    sourceAccount.id,
  );

  const destinationAfterFailure = await db.bankAccounts.get(
    destinationAccount.id,
  );

  const preservedTransfer = await db.transfers.get(
    protectedTransfer.id,
  );

  if (
    !sourceAfterFailure ||
    !destinationAfterFailure ||
    sourceAfterFailure.balance !==
      sourceBeforeFailure.balance ||
    destinationAfterFailure.balance !==
      destinationBeforeFailure.balance ||
    !preservedTransfer
  ) {
    throw new Error(
      "Failed transfer reversal changed state.",
    );
  }

  console.log("Transfer reversal failure preservation passed.");

  // Missing source account.
  const missingSourceTransfer = await db.transfers.add({
    id: `__TEST_MISSING_SOURCE_TRANSFER_${now}__`,
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending",
    fromAccountId: "__NON_EXISTENT_SOURCE__",
    toAccountId: destinationAccount.id,
    amount: 1000,
    date: now,
  });

  try {
    await transferReversalOperation.delete(
      missingSourceTransfer,
    );

    throw new Error(
      "Transfer with missing source account was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Source account not found."
    ) {
      console.log("Missing source account rejection passed.");
    } else {
      throw error;
    }
  }

  // Missing destination account.
  const missingDestinationTransfer = await db.transfers.add({
    id: `__TEST_MISSING_DESTINATION_TRANSFER_${now}__`,
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending",
    fromAccountId: sourceAccount.id,
    toAccountId: "__NON_EXISTENT_DESTINATION__",
    amount: 1000,
    date: now,
  });

  try {
    await transferReversalOperation.delete(
      missingDestinationTransfer,
    );

    throw new Error(
      "Transfer with missing destination account was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Destination account not found."
    ) {
      console.log(
        "Missing destination account rejection passed.",
      );
    } else {
      throw error;
    }
  }

  console.log("Transfer reversal operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Transfer reversal operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

