import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { bankAccountService } from "../frontend/src/services/bank-account.service";
import { bankAccountEditOperation } from "../frontend/src/services/operations/bank-account-edit.operation";
import { transferOperation } from "../frontend/src/services/operations/transfer.operation";

async function main() {
  const now = Date.now();

  const account = await bankAccountService.create({
    type: "cash",
    name: `__TEST_ACCOUNT_EDIT_${now}__`,
    initialBalance: 5000,
    notes: "Original",
  });

  const secondAccount = await bankAccountService.create({
    type: "bank",
    name: `__TEST_ACCOUNT_EDIT_OTHER_${now}__`,
    initialBalance: 2000,
  });

  await bankAccountEditOperation.edit({
    accountId: account.id,
    name: `__TEST_ACCOUNT_EDITED_${now}__`,
  });

  let updated = await db.bankAccounts.get(account.id);

  if (
    !updated ||
    updated.name !== `__TEST_ACCOUNT_EDITED_${now}__` ||
    updated.type !== "cash" ||
    updated.initialBalance !== 5000 ||
    updated.balance !== 5000
  ) {
    throw new Error("Bank account edit persistence failed.");
  }

  console.log("Bank account edit persistence passed.");

  const transfer = await transferOperation.create({
    fromAccountId: account.id,
    toAccountId: secondAccount.id,
    amount: 1000,
    date: now,
    note: "History preservation",
  });

  updated = await db.bankAccounts.get(account.id);

  if (!updated || updated.balance !== 4000) {
    throw new Error("Bank account balance setup failed.");
  }

  await bankAccountEditOperation.edit({
    accountId: account.id,
    name: updated.name,
  });

  updated = await db.bankAccounts.get(account.id);

  if (
    !updated ||
    updated.balance !== 4000 ||
    updated.initialBalance !== 5000 ||
    updated.type !== "cash"
  ) {
    throw new Error("Account financial state changed during name edit.");
  }

  console.log("Bank account balance preservation passed.");

  const storedTransfer = await db.transfers.get(transfer.id);

  if (
    !storedTransfer ||
    storedTransfer.fromAccountId !== account.id ||
    storedTransfer.toAccountId !== secondAccount.id ||
    storedTransfer.amount !== 1000
  ) {
    throw new Error("Account edit modified transfer history.");
  }

  console.log("Historical transfer preservation passed.");

  try {
    await bankAccountEditOperation.edit({
      accountId: account.id,
      name: secondAccount.name,
    });

    throw new Error("Duplicate account name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "A bank account with this name already exists."
    ) {
      console.log("Duplicate account name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await bankAccountEditOperation.edit({
      accountId: account.id,
      name: "",
    });

    throw new Error("Empty account name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Account name is required."
    ) {
      console.log("Empty account name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await bankAccountEditOperation.edit({
      accountId: "__NON_EXISTENT_ACCOUNT__",
      name: "Should fail",
    });

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

  const beforeFailure = await db.bankAccounts.get(account.id);

  if (!beforeFailure) {
    throw new Error("Account disappeared before rollback test.");
  }

  try {
    await bankAccountEditOperation.edit({
      accountId: account.id,
      name: "",
    });

    throw new Error("Invalid account edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Account name is required."
    ) {
      console.log("Account failed-edit rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailure = await db.bankAccounts.get(account.id);

  if (
    !afterFailure ||
    afterFailure.name !== beforeFailure.name ||
    afterFailure.type !== beforeFailure.type ||
    afterFailure.initialBalance !== beforeFailure.initialBalance ||
    afterFailure.balance !== beforeFailure.balance
  ) {
    throw new Error("Failed account edit was not atomic.");
  }

  console.log("Bank account edit rollback passed.");
  console.log("Bank account edit operation test passed.");
}

main().catch((error) => {
  console.error("Bank account edit operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

