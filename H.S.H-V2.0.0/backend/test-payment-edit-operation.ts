import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { supplierService } from "../frontend/src/services/supplier.service";
import { customerService } from "../frontend/src/services/customer.service";
import { workerService } from "../frontend/src/services/worker.service";
import { bankAccountService } from "../frontend/src/services/bank-account.service";
import { expenseService } from "../frontend/src/services/expense.service";
import { paymentOperation } from "../frontend/src/services/operations/payment.operation";
import { paymentEditOperation } from "../frontend/src/services/operations/payment-edit.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const supplier = await supplierService.create({
    name: `__TEST_PAYMENT_EDIT_SUPPLIER_${now}__`,
    phone: "0000000000",
  });

  const customer = await customerService.create({
    name: `__TEST_PAYMENT_EDIT_CUSTOMER_${now}__`,
    phone: "0000000000",
    type: "retail",
  });

  const worker = await workerService.create({
    name: `__TEST_PAYMENT_EDIT_WORKER_${now}__`,
    phone: "0000000000",
    employmentDate: now,
    position: "Butcher",
    startingSalary: 5000,
    monthlySalary: 50000,
  });

  const account = await bankAccountService.create({
    type: "cash",
    name: `__TEST_PAYMENT_EDIT_ACCOUNT_${now}__`,
    initialBalance: 10000,
  });

  await db.suppliers.update(supplier.id, {
    balance: 5000,
  });

  await db.customers.update(customer.id, {
    balance: 5000,
  });

  await db.workers.update(worker.id, {
    balance: 5000,
  });

  const supplierPayment = await paymentOperation.create({
    entityType: "supplier",
    entityId: supplier.id,
    accountId: account.id,
    amount: 1000,
    date: now,
    note: "Original supplier payment",
  });

  let currentSupplier = await db.suppliers.get(supplier.id);
  let currentAccount = await db.bankAccounts.get(account.id);

  if (
    !currentSupplier ||
    !currentAccount ||
    currentSupplier.balance !== 4000 ||
    currentAccount.balance !== 9000
  ) {
    throw new Error("Initial supplier payment setup failed.");
  }

  await paymentEditOperation.edit({
    paymentId: supplierPayment.id,
    entityType: "supplier",
    entityId: supplier.id,
    accountId: account.id,
    amount: 2000,
    date: now + 1,
    note: "Edited supplier payment",
  });

  currentSupplier = await db.suppliers.get(supplier.id);
  currentAccount = await db.bankAccounts.get(account.id);

  const editedSupplierPayment = await db.payments.get(
    supplierPayment.id,
  );

  if (
    !currentSupplier ||
    !currentAccount ||
    !editedSupplierPayment ||
    currentSupplier.balance !== 3000 ||
    currentAccount.balance !== 8000 ||
    editedSupplierPayment.amount !== 2000 ||
    editedSupplierPayment.entityId !== supplier.id ||
    editedSupplierPayment.entityType !== "supplier"
  ) {
    throw new Error("Supplier payment edit failed.");
  }

  console.log("Supplier payment edit passed.");

  const customerPayment = await paymentOperation.create({
    entityType: "customer",
    entityId: customer.id,
    accountId: account.id,
    amount: 1000,
    date: now,
  });

  let currentCustomer = await db.customers.get(customer.id);
  currentAccount = await db.bankAccounts.get(account.id);

  if (
    !currentCustomer ||
    !currentAccount ||
    currentCustomer.balance !== 4000 ||
    currentAccount.balance !== 9000
  ) {
    throw new Error("Initial customer payment setup failed.");
  }

  await paymentEditOperation.edit({
    paymentId: customerPayment.id,
    entityType: "customer",
    entityId: customer.id,
    accountId: account.id,
    amount: 2000,
    date: now + 1,
  });

  currentCustomer = await db.customers.get(customer.id);
  currentAccount = await db.bankAccounts.get(account.id);

  if (
    !currentCustomer ||
    !currentAccount ||
    currentCustomer.balance !== 3000 ||
    currentAccount.balance !== 10000
  ) {
    throw new Error("Customer payment edit failed.");
  }

  console.log("Customer payment edit passed.");

  const workerPayment = await paymentOperation.create({
    entityType: "worker",
    entityId: worker.id,
    accountId: account.id,
    amount: 1000,
    date: now,
  });

  let currentWorker = await db.workers.get(worker.id);
  currentAccount = await db.bankAccounts.get(account.id);

  if (
    !currentWorker ||
    !currentAccount ||
    currentWorker.balance !== 4000 ||
    currentAccount.balance !== 9000
  ) {
    throw new Error("Initial worker payment setup failed.");
  }

  await paymentEditOperation.edit({
    paymentId: workerPayment.id,
    entityType: "worker",
    entityId: worker.id,
    accountId: account.id,
    amount: 2000,
    date: now + 1,
  });

  currentWorker = await db.workers.get(worker.id);
  currentAccount = await db.bankAccounts.get(account.id);

  if (
    !currentWorker ||
    !currentAccount ||
    currentWorker.balance !== 3000 ||
    currentAccount.balance !== 8000
  ) {
    throw new Error("Worker payment edit failed.");
  }

  console.log("Worker payment edit passed.");

  const expenseAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_PAYMENT_EDIT_EXPENSE_ACCOUNT_${now}__`,
    initialBalance: 5000,
  });

  const expense = await expenseService.create({
    accountId: expenseAccount.id,
    date: now,
    name: `__TEST_PAYMENT_EDIT_EXPENSE_${now}__`,
    amount: 1000,
  });

  const expensePayment = await paymentOperation.create({
    entityType: "expense",
    entityId: expense.id,
    accountId: expenseAccount.id,
    amount: 1000,
    date: now,
  });

  currentAccount = await db.bankAccounts.get(expenseAccount.id);

  if (!currentAccount || currentAccount.balance !== 4000) {
    throw new Error("Initial expense payment setup failed.");
  }

  await paymentEditOperation.edit({
    paymentId: expensePayment.id,
    entityType: "expense",
    entityId: expense.id,
    accountId: expenseAccount.id,
    amount: 2000,
    date: now + 1,
  });

  currentAccount = await db.bankAccounts.get(expenseAccount.id);

  if (!currentAccount || currentAccount.balance !== 3000) {
    throw new Error("Expense payment edit failed.");
  }

  console.log("Expense payment edit passed.");

  /*
   * Atomicity test:
   *
   * Supplier currently has 3000 balance.
   * Account currently has 8000 balance.
   *
   * Try editing the supplier payment to 5000.
   * The operation must fail and restore the original state.
   */

  const supplierBeforeFailure = await db.suppliers.get(
    supplier.id,
  );

  const accountBeforeFailure = await db.bankAccounts.get(
    account.id,
  );

  const paymentBeforeFailure = await db.payments.get(
    supplierPayment.id,
  );

  if (
    !supplierBeforeFailure ||
    !accountBeforeFailure ||
    !paymentBeforeFailure
  ) {
    throw new Error("Missing state before rollback test.");
  }

  try {
    await paymentEditOperation.edit({
      paymentId: supplierPayment.id,
      entityType: "supplier",
      entityId: supplier.id,
      accountId: account.id,
      amount: 6000,
      date: now + 2,
      note: "Should fail",
    });

    throw new Error(
      "Invalid supplier payment edit was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Payment exceeds supplier balance."
    ) {
      console.log("Supplier payment edit rejection passed.");
    } else {
      throw error;
    }
  }

  const supplierAfterFailure = await db.suppliers.get(
    supplier.id,
  );

  const accountAfterFailure = await db.bankAccounts.get(
    account.id,
  );

  const paymentAfterFailure = await db.payments.get(
    supplierPayment.id,
  );

  if (
    !supplierAfterFailure ||
    !accountAfterFailure ||
    !paymentAfterFailure ||
    supplierAfterFailure.balance !==
      supplierBeforeFailure.balance ||
    accountAfterFailure.balance !==
      accountBeforeFailure.balance ||
    paymentAfterFailure.amount !==
      paymentBeforeFailure.amount ||
    paymentAfterFailure.date !==
      paymentBeforeFailure.date ||
    paymentAfterFailure.note !==
      paymentBeforeFailure.note
  ) {
    throw new Error(
      "Failed payment edit was not atomic.",
    );
  }

  console.log("Payment edit rollback passed.");

  try {
    await paymentEditOperation.edit({
      paymentId: "__NON_EXISTENT_PAYMENT__",
      entityType: "supplier",
      entityId: supplier.id,
      accountId: account.id,
      amount: 100,
      date: now,
    });

    throw new Error("Missing payment was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Payment not found."
    ) {
      console.log("Missing payment rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await paymentEditOperation.edit({
      paymentId: supplierPayment.id,
      entityType: "supplier",
      entityId: "__NON_EXISTENT_SUPPLIER__",
      accountId: account.id,
      amount: 100,
      date: now,
    });

    throw new Error("Missing new supplier was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Supplier not found."
    ) {
      console.log("Missing new supplier rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await paymentEditOperation.edit({
      paymentId: supplierPayment.id,
      entityType: "supplier",
      entityId: supplier.id,
      accountId: "__NON_EXISTENT_ACCOUNT__",
      amount: 100,
      date: now,
    });

    throw new Error("Missing new account was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Account not found."
    ) {
      console.log("Missing new account rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await paymentEditOperation.edit({
      paymentId: supplierPayment.id,
      entityType: "supplier",
      entityId: supplier.id,
      accountId: account.id,
      amount: 0,
      date: now,
    });

    throw new Error("Zero payment amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Payment amount must be greater than zero."
    ) {
      console.log("Invalid payment amount rejection passed.");
    } else {
      throw error;
    }
  }

  console.log("Payment edit operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Payment edit operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

