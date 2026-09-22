import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { supplierService } from "../frontend/src/services/supplier.service";
import { customerService } from "../frontend/src/services/customer.service";
import { workerService } from "../frontend/src/services/worker.service";
import { expenseService } from "../frontend/src/services/expense.service";
import { bankAccountService } from "../frontend/src/services/bank-account.service";
import { paymentOperation } from "../frontend/src/services/operations/payment.operation";
import { paymentReversalOperation } from "../frontend/src/services/operations/payment-reversal.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  // Supplier
  const supplierAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_REVERSAL_SUPPLIER_ACCOUNT_${now}__`,
    initialBalance: 10000,
  });

  const supplier = await supplierService.create({
    name: `__TEST_REVERSAL_SUPPLIER_${now}__`,
    phone: "0000000000",
  });

  await db.suppliers.update(supplier.id, {
    balance: 5000,
  });

  const supplierPayment = await paymentOperation.create({
    entityType: "supplier",
    entityId: supplier.id,
    accountId: supplierAccount.id,
    amount: 2000,
    date: now,
  });

  let currentSupplier = await db.suppliers.get(supplier.id);
  let currentCustomer;
  let currentWorker;
  let currentAccount = await db.bankAccounts.get(supplierAccount.id);

  if (
    !currentSupplier ||
    !currentAccount ||
    currentSupplier.balance !== 3000 ||
    currentAccount.balance !== 8000
  ) {
    throw new Error("Initial supplier payment setup failed.");
  }

  await paymentReversalOperation.delete(supplierPayment.id);

  currentSupplier = await db.suppliers.get(supplier.id);
  currentAccount = await db.bankAccounts.get(supplierAccount.id);

  if (
    !currentSupplier ||
    !currentAccount ||
    currentSupplier.balance !== 5000 ||
    currentAccount.balance !== 10000 ||
    (await db.payments.get(supplierPayment.id))
  ) {
    throw new Error("Supplier payment reversal failed.");
  }

  console.log("Supplier payment reversal passed.");

  // Customer
  const customerAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_REVERSAL_CUSTOMER_ACCOUNT_${now}__`,
    initialBalance: 10000,
  });

  const customer = await customerService.create({
    name: `__TEST_REVERSAL_CUSTOMER_${now}__`,
    phone: "0000000000",
    type: "retail",
  });

  await db.customers.update(customer.id, {
    balance: 5000,
  });

  const customerPayment = await paymentOperation.create({
    entityType: "customer",
    entityId: customer.id,
    accountId: customerAccount.id,
    amount: 2000,
    date: now,
  });

  currentCustomer = await db.customers.get(customer.id);
  currentAccount = await db.bankAccounts.get(customerAccount.id);

  if (
    !currentCustomer ||
    !currentAccount ||
    currentCustomer.balance !== 3000 ||
    currentAccount.balance !== 12000
  ) {
    throw new Error("Initial customer payment setup failed.");
  }

  await paymentReversalOperation.delete(customerPayment.id);

  currentCustomer = await db.customers.get(customer.id);
  currentAccount = await db.bankAccounts.get(customerAccount.id);

  if (
    !currentCustomer ||
    !currentAccount ||
    currentCustomer.balance !== 5000 ||
    currentAccount.balance !== 10000 ||
    (await db.payments.get(customerPayment.id))
  ) {
    throw new Error("Customer payment reversal failed.");
  }

  console.log("Customer payment reversal passed.");

  // Worker
  const workerAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_REVERSAL_WORKER_ACCOUNT_${now}__`,
    initialBalance: 10000,
  });

  const worker = await workerService.create({
    name: `__TEST_REVERSAL_WORKER_${now}__`,
    phone: "0000000000",
    employmentDate: now,
    position: "Butcher",
    startingSalary: 5000,
    monthlySalary: 50000,
  });

  await db.workers.update(worker.id, {
    balance: 5000,
  });

  const workerPayment = await paymentOperation.create({
    entityType: "worker",
    entityId: worker.id,
    accountId: workerAccount.id,
    amount: 2000,
    date: now,
  });

  currentWorker = await db.workers.get(worker.id);
  currentAccount = await db.bankAccounts.get(workerAccount.id);

  if (
    !currentWorker ||
    !currentAccount ||
    currentWorker.balance !== 3000 ||
    currentAccount.balance !== 8000
  ) {
    throw new Error("Initial worker payment setup failed.");
  }

  await paymentReversalOperation.delete(workerPayment.id);

  currentWorker = await db.workers.get(worker.id);
  currentAccount = await db.bankAccounts.get(workerAccount.id);

  if (
    !currentWorker ||
    !currentAccount ||
    currentWorker.balance !== 5000 ||
    currentAccount.balance !== 10000 ||
    (await db.payments.get(workerPayment.id))
  ) {
    throw new Error("Worker payment reversal failed.");
  }

  console.log("Worker payment reversal passed.");

  // Expense
  const expenseAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_REVERSAL_EXPENSE_ACCOUNT_${now}__`,
    initialBalance: 10000,
  });

  const expense = await expenseService.create({
    accountId: expenseAccount.id,
    date: now,
    name: `__TEST_REVERSAL_EXPENSE_${now}__`,
    amount: 2000,
  });

  const expensePayment = await paymentOperation.create({
    entityType: "expense",
    entityId: expense.id,
    accountId: expenseAccount.id,
    amount: 2000,
    date: now,
  });

  currentAccount = await db.bankAccounts.get(expenseAccount.id);

  if (!currentAccount || currentAccount.balance !== 8000) {
    throw new Error("Initial expense payment setup failed.");
  }

  await paymentReversalOperation.delete(expensePayment.id);

  currentAccount = await db.bankAccounts.get(expenseAccount.id);

  if (
    !currentAccount ||
    currentAccount.balance !== 10000 ||
    (await db.payments.get(expensePayment.id))
  ) {
    throw new Error("Expense payment reversal failed.");
  }

  console.log("Expense payment reversal passed.");

  // Missing payment
  try {
    await paymentReversalOperation.delete(
      "__NON_EXISTENT_PAYMENT__",
    );

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

  console.log("Payment reversal operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Payment reversal operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

