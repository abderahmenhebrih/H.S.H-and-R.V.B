import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { bankAccountService } from "../frontend/src/services/bank-account.service";
import { transferOperation } from "../frontend/src/services/operations/transfer.operation";
import { transferEditOperation } from "../frontend/src/services/operations/transfer-edit.operation";
import { transferReversalOperation } from "../frontend/src/services/operations/transfer-reversal.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const accountA = await bankAccountService.create({
    type: "cash",
    name: `__TEST_TRANSFER_A_${now}__`,
    initialBalance: 10000,
  });

  const accountB = await bankAccountService.create({
    type: "bank",
    name: `__TEST_TRANSFER_B_${now}__`,
    initialBalance: 5000,
  });

  const accountC = await bankAccountService.create({
    type: "bank",
    name: `__TEST_TRANSFER_C_${now}__`,
    initialBalance: 2000,
  });

  // Create
  const transfer = await transferOperation.create({
    fromAccountId: accountA.id,
    toAccountId: accountB.id,
    amount: 2000,
    date: now,
    note: "Original transfer",
  });

  let currentA = await db.bankAccounts.get(accountA.id);
  let currentB = await db.bankAccounts.get(accountB.id);

  if (
    !currentA ||
    !currentB ||
    currentA.balance !== 8000 ||
    currentB.balance !== 7000
  ) {
    throw new Error("Transfer creation accounting failed.");
  }

  const storedTransfer = await db.transfers.get(transfer.id);

  if (
    !storedTransfer ||
    storedTransfer.fromAccountId !== accountA.id ||
    storedTransfer.toAccountId !== accountB.id ||
    storedTransfer.amount !== 2000
  ) {
    throw new Error("Transfer persistence failed.");
  }

  console.log("Transfer creation accounting passed.");

  // Edit same accounts
  await transferEditOperation.edit({
    transferId: transfer.id,
    fromAccountId: accountA.id,
    toAccountId: accountB.id,
    amount: 3000,
    date: now + 1,
    note: "Edited transfer",
  });

  currentA = await db.bankAccounts.get(accountA.id);
  currentB = await db.bankAccounts.get(accountB.id);

  if (
    !currentA ||
    !currentB ||
    currentA.balance !== 7000 ||
    currentB.balance !== 8000
  ) {
    throw new Error("Transfer same-account edit failed.");
  }

  const editedTransfer = await db.transfers.get(transfer.id);

  if (
    !editedTransfer ||
    editedTransfer.amount !== 3000 ||
    editedTransfer.date !== now + 1 ||
    editedTransfer.note !== "Edited transfer"
  ) {
    throw new Error("Transfer edit persistence failed.");
  }

  console.log("Transfer same-account edit passed.");

  // Edit to different accounts
  await transferEditOperation.edit({
    transferId: transfer.id,
    fromAccountId: accountB.id,
    toAccountId: accountC.id,
    amount: 1500,
    date: now + 2,
    note: "Moved transfer",
  });

  currentA = await db.bankAccounts.get(accountA.id);
  currentB = await db.bankAccounts.get(accountB.id);
  const currentC = await db.bankAccounts.get(accountC.id);

  if (
    !currentA ||
    !currentB ||
    !currentC ||
    currentA.balance !== 10000 ||
    currentB.balance !== 3500 ||
    currentC.balance !== 3500
  ) {
    throw new Error("Transfer account-change edit failed.");
  }

  const movedTransfer = await db.transfers.get(transfer.id);

  if (
    !movedTransfer ||
    movedTransfer.fromAccountId !== accountB.id ||
    movedTransfer.toAccountId !== accountC.id ||
    movedTransfer.amount !== 1500
  ) {
    throw new Error("Transfer account-change persistence failed.");
  }

  console.log("Transfer account-change edit passed.");

  // Reversal
  await transferReversalOperation.delete(transfer.id);

  const deletedTransfer = await db.transfers.get(transfer.id);
  currentA = await db.bankAccounts.get(accountA.id);
  currentB = await db.bankAccounts.get(accountB.id);
  const restoredC = await db.bankAccounts.get(accountC.id);

  if (
    deletedTransfer ||
    !currentA ||
    !currentB ||
    !restoredC ||
    currentA.balance !== 10000 ||
    currentB.balance !== 5000 ||
    restoredC.balance !== 2000
  ) {
    throw new Error("Transfer reversal failed.");
  }

  console.log("Transfer reversal passed.");

  // Invalid amount
  try {
    await transferOperation.create({
      fromAccountId: accountA.id,
      toAccountId: accountB.id,
      amount: 0,
      date: now,
    });

    throw new Error("Invalid transfer amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Transfer amount must be greater than zero."
    ) {
      console.log("Invalid transfer amount rejection passed.");
    } else {
      throw error;
    }
  }

  // Same account
  try {
    await transferOperation.create({
      fromAccountId: accountA.id,
      toAccountId: accountA.id,
      amount: 1000,
      date: now,
    });

    throw new Error("Same source/destination account was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Source and destination accounts must be different."
    ) {
      console.log("Same-account transfer rejection passed.");
    } else {
      throw error;
    }
  }

  // Missing source
  try {
    await transferOperation.create({
      fromAccountId: "__NON_EXISTENT_SOURCE__",
      toAccountId: accountB.id,
      amount: 1000,
      date: now,
    });

    throw new Error("Missing source account was accepted.");
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

  // Missing destination
  try {
    await transferOperation.create({
      fromAccountId: accountA.id,
      toAccountId: "__NON_EXISTENT_DESTINATION__",
      amount: 1000,
      date: now,
    });

    throw new Error("Missing destination account was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Destination account not found."
    ) {
      console.log("Missing destination account rejection passed.");
    } else {
      throw error;
    }
  }

  // Insufficient source balance
  try {
    await transferOperation.create({
      fromAccountId: accountC.id,
      toAccountId: accountA.id,
      amount: 999999,
      date: now,
    });

    throw new Error(
      "Transfer with insufficient source balance was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Insufficient source account balance."
    ) {
      console.log("Insufficient source balance rejection passed.");
    } else {
      throw error;
    }
  }

  // Missing transfer edit
  try {
    await transferEditOperation.edit({
      transferId: "__NON_EXISTENT_TRANSFER__",
      fromAccountId: accountA.id,
      toAccountId: accountB.id,
      amount: 1000,
      date: now,
    });

    throw new Error("Missing transfer edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Transfer not found."
    ) {
      console.log("Missing transfer edit rejection passed.");
    } else {
      throw error;
    }
  }

  // Invalid edit amount
  const rollbackTransfer = await transferOperation.create({
    fromAccountId: accountA.id,
    toAccountId: accountB.id,
    amount: 1000,
    date: now,
  });

  const beforeFailureA = await db.bankAccounts.get(accountA.id);
  const beforeFailureB = await db.bankAccounts.get(accountB.id);

  if (!beforeFailureA || !beforeFailureB) {
    throw new Error("Transfer rollback setup failed.");
  }

  try {
    await transferEditOperation.edit({
      transferId: rollbackTransfer.id,
      fromAccountId: accountA.id,
      toAccountId: accountB.id,
      amount: 999999,
      date: now,
    });

    throw new Error("Invalid transfer edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Insufficient source account balance."
    ) {
      console.log("Transfer edit failure rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailureTransfer = await db.transfers.get(
    rollbackTransfer.id,
  );
  const afterFailureA = await db.bankAccounts.get(accountA.id);
  const afterFailureB = await db.bankAccounts.get(accountB.id);

  if (
    !afterFailureTransfer ||
    !afterFailureA ||
    !afterFailureB ||
    afterFailureTransfer.amount !== rollbackTransfer.amount ||
    afterFailureTransfer.fromAccountId !==
      rollbackTransfer.fromAccountId ||
    afterFailureTransfer.toAccountId !==
      rollbackTransfer.toAccountId ||
    afterFailureA.balance !== beforeFailureA.balance ||
    afterFailureB.balance !== beforeFailureB.balance
  ) {
    throw new Error("Failed transfer edit was not atomic.");
  }

  console.log("Transfer edit rollback passed.");

  // Reversal protection
  const protectedTransfer = await transferOperation.create({
    fromAccountId: accountA.id,
    toAccountId: accountB.id,
    amount: 500,
    date: now,
  });

  await db.bankAccounts.update(accountB.id, {
    balance: 0,
  });

  try {
    await transferReversalOperation.delete(protectedTransfer.id);

    throw new Error(
      "Transfer with insufficient destination balance was reversed.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot reverse transfer because destination account balance is insufficient."
    ) {
      console.log("Transfer reversal balance protection passed.");
    } else {
      throw error;
    }
  }

  const preservedTransfer = await db.transfers.get(
    protectedTransfer.id,
  );

  if (!preservedTransfer) {
    throw new Error("Failed transfer reversal removed the transfer.");
  }

  console.log("Transfer reversal failure preservation passed.");

  // Missing reversal
  try {
    await transferReversalOperation.delete(
      "__NON_EXISTENT_TRANSFER__",
    );

    throw new Error("Missing transfer reversal was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Transfer not found."
    ) {
      console.log("Missing transfer reversal rejection passed.");
    } else {
      throw error;
    }
  }

  console.log("Transfer operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Transfer operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

