import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { expenseOperation } from "../frontend/src/services/operations/expense.operation";
import { expenseEditOperation } from "../frontend/src/services/operations/expense-edit.operation";
import { expenseReversalOperation } from "../frontend/src/services/operations/expense-reversal.operation";
import { bankAccountService } from "../frontend/src/services/bank-account.service";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const account = await bankAccountService.create({
    type: "cash",
    name: `__TEST_EXPENSE_ACCOUNT_${now}__`,
    initialBalance: 10000,
  });

  const secondAccount = await bankAccountService.create({
    type: "bank",
    name: `__TEST_EXPENSE_ACCOUNT_OTHER_${now}__`,
    initialBalance: 5000,
  });

  // Create
  const expense = await expenseOperation.create({
    name: `__TEST_EXPENSE_${now}__`,
    amount: 2000,
    accountId: account.id,
    date: now,
    note: "Original expense",
  });

  let storedExpense = await db.expenses.get(expense.id);
  let currentAccount = await db.bankAccounts.get(account.id);

  if (
    !storedExpense ||
    storedExpense.amount !== 2000 ||
    storedExpense.accountId !== account.id ||
    storedExpense.name !== `__TEST_EXPENSE_${now}__` ||
    !currentAccount ||
    currentAccount.balance !== 8000
  ) {
    throw new Error("Expense creation accounting failed.");
  }

  console.log("Expense creation accounting passed.");

  // Edit same account
  await expenseEditOperation.edit({
    expenseId: expense.id,
    name: `__TEST_EXPENSE_EDITED_${now}__`,
    amount: 3000,
    accountId: account.id,
    date: now + 1,
    note: "Edited expense",
  });

  storedExpense = await db.expenses.get(expense.id);
  currentAccount = await db.bankAccounts.get(account.id);

  if (
    !storedExpense ||
    storedExpense.amount !== 3000 ||
    storedExpense.name !== `__TEST_EXPENSE_EDITED_${now}__` ||
    storedExpense.accountId !== account.id ||
    !currentAccount ||
    currentAccount.balance !== 7000
  ) {
    throw new Error("Expense same-account edit failed.");
  }

  console.log("Expense same-account edit passed.");

  // Edit to another account
  await expenseEditOperation.edit({
    expenseId: expense.id,
    name: storedExpense.name,
    amount: 1500,
    accountId: secondAccount.id,
    date: now + 2,
    note: "Moved account",
  });

  storedExpense = await db.expenses.get(expense.id);
  const originalAccountAfterMove = await db.bankAccounts.get(account.id);
  const secondAccountAfterMove = await db.bankAccounts.get(
    secondAccount.id,
  );

  if (
    !storedExpense ||
    storedExpense.amount !== 1500 ||
    storedExpense.accountId !== secondAccount.id ||
    !originalAccountAfterMove ||
    originalAccountAfterMove.balance !== 10000 ||
    !secondAccountAfterMove ||
    secondAccountAfterMove.balance !== 3500
  ) {
    throw new Error("Expense account-change edit failed.");
  }

  console.log("Expense account-change edit passed.");

  // Reversal
  await expenseReversalOperation.delete(expense.id);

  const deletedExpense = await db.expenses.get(expense.id);
  const restoredAccount = await db.bankAccounts.get(secondAccount.id);

  if (
    deletedExpense ||
    !restoredAccount ||
    restoredAccount.balance !== 5000
  ) {
    throw new Error("Expense reversal failed.");
  }

  console.log("Expense reversal passed.");

  // Missing expense
  try {
    await expenseReversalOperation.delete(
      "__NON_EXISTENT_EXPENSE__",
    );

    throw new Error("Missing expense was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Expense not found."
    ) {
      console.log("Missing expense rejection passed.");
    } else {
      throw error;
    }
  }

  // Invalid amount
  try {
    await expenseOperation.create({
      name: `__TEST_INVALID_EXPENSE_${now}__`,
      amount: 0,
      accountId: account.id,
      date: now,
    });

    throw new Error("Invalid expense amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Expense amount must be greater than zero."
    ) {
      console.log("Invalid expense amount rejection passed.");
    } else {
      throw error;
    }
  }

  // Missing account
  try {
    await expenseOperation.create({
      name: `__TEST_MISSING_ACCOUNT_EXPENSE_${now}__`,
      amount: 1000,
      accountId: "__NON_EXISTENT_ACCOUNT__",
      date: now,
    });

    throw new Error("Missing account was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Account not found."
    ) {
      console.log("Missing expense account rejection passed.");
    } else {
      throw error;
    }
  }

  // Insufficient balance
  try {
    await expenseOperation.create({
      name: `__TEST_INSUFFICIENT_EXPENSE_${now}__`,
      amount: 999999,
      accountId: account.id,
      date: now,
    });

    throw new Error(
      "Expense with insufficient account balance was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Insufficient account balance."
    ) {
      console.log("Insufficient expense balance rejection passed.");
    } else {
      throw error;
    }
  }

  // Missing expense for edit
  try {
    await expenseEditOperation.edit({
      expenseId: "__NON_EXISTENT_EXPENSE__",
      name: "Should fail",
      amount: 1000,
      accountId: account.id,
      date: now,
    });

    throw new Error("Missing expense edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Expense not found."
    ) {
      console.log("Missing expense edit rejection passed.");
    } else {
      throw error;
    }
  }

  // Invalid edit amount
  const rollbackExpense = await expenseOperation.create({
    name: `__TEST_EXPENSE_ROLLBACK_${now}__`,
    amount: 1000,
    accountId: account.id,
    date: now,
  });

  const beforeFailureAccount = await db.bankAccounts.get(account.id);

  if (!beforeFailureAccount) {
    throw new Error("Rollback account setup failed.");
  }

  try {
    await expenseEditOperation.edit({
      expenseId: rollbackExpense.id,
      name: "Should fail",
      amount: 999999,
      accountId: account.id,
      date: now,
    });

    throw new Error("Invalid expense edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Insufficient account balance."
    ) {
      console.log("Expense edit failure rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailureExpense = await db.expenses.get(
    rollbackExpense.id,
  );
  const afterFailureAccount = await db.bankAccounts.get(account.id);

  if (
    !afterFailureExpense ||
    !afterFailureAccount ||
    afterFailureExpense.amount !== rollbackExpense.amount ||
    afterFailureExpense.name !== rollbackExpense.name ||
    afterFailureExpense.accountId !== rollbackExpense.accountId ||
    afterFailureAccount.balance !== beforeFailureAccount.balance
  ) {
    throw new Error("Failed expense edit was not atomic.");
  }

  console.log("Expense edit rollback passed.");
  console.log("Expense operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Expense operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

