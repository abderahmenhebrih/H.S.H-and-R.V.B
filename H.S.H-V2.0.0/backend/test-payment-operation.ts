import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { supplierService } from "../frontend/src/services/supplier.service";
import { customerService } from "../frontend/src/services/customer.service";
import { workerService } from "../frontend/src/services/worker.service";
import { bankAccountService } from "../frontend/src/services/bank-account.service";
import { expenseService } from "../frontend/src/services/expense.service";
import { paymentOperation } from "../frontend/src/services/operations/payment.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  // ------------------------------------------------------------
  // SUPPLIER PAYMENT
  // ------------------------------------------------------------

  const supplier = await supplierService.create({
    name: `__TEST_PAYMENT_SUPPLIER_${now}__`,
    phone: "0000000000",
  });

  await db.suppliers.update(supplier.id, {
    balance: 3000,
  });

  const supplierAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_PAYMENT_SUPPLIER_ACCOUNT_${now}__`,
    initialBalance: 5000,
  });

  const supplierPayment = await paymentOperation.create({
    entityType: "supplier",
    entityId: supplier.id,
    accountId: supplierAccount.id,
    amount: 1000,
    date: now,
    note: "Supplier payment test",
  });

  const updatedSupplier = await db.suppliers.get(supplier.id);
  const updatedSupplierAccount = await db.bankAccounts.get(
    supplierAccount.id,
  );
  const storedSupplierPayment = await db.payments.get(
    supplierPayment.id,
  );

  if (
    !updatedSupplier ||
    updatedSupplier.balance !== 2000 ||
    !updatedSupplierAccount ||
    updatedSupplierAccount.balance !== 4000 ||
    !storedSupplierPayment ||
    storedSupplierPayment.entityType !== "supplier" ||
    storedSupplierPayment.entityId !== supplier.id ||
    storedSupplierPayment.accountId !== supplierAccount.id ||
    storedSupplierPayment.amount !== 1000
  ) {
    throw new Error("Supplier payment accounting failed.");
  }

  console.log("Supplier payment accounting passed.");

  // ------------------------------------------------------------
  // CUSTOMER PAYMENT
  // ------------------------------------------------------------

  const customer = await customerService.create({
    name: `__TEST_PAYMENT_CUSTOMER_${now}__`,
    phone: "0000000000",
    type: "retail",
  });

  await db.customers.update(customer.id, {
    balance: 3000,
  });

  const customerAccount = await bankAccountService.create({
    type: "bank",
    name: `__TEST_PAYMENT_CUSTOMER_ACCOUNT_${now}__`,
    initialBalance: 5000,
  });

  const customerPayment = await paymentOperation.create({
    entityType: "customer",
    entityId: customer.id,
    accountId: customerAccount.id,
    amount: 1000,
    date: now,
    note: "Customer payment test",
  });

  const updatedCustomer = await db.customers.get(customer.id);
  const updatedCustomerAccount = await db.bankAccounts.get(
    customerAccount.id,
  );
  const storedCustomerPayment = await db.payments.get(
    customerPayment.id,
  );

  if (
    !updatedCustomer ||
    updatedCustomer.balance !== 2000 ||
    !updatedCustomerAccount ||
    updatedCustomerAccount.balance !== 6000 ||
    !storedCustomerPayment ||
    storedCustomerPayment.entityType !== "customer" ||
    storedCustomerPayment.entityId !== customer.id ||
    storedCustomerPayment.accountId !== customerAccount.id ||
    storedCustomerPayment.amount !== 1000
  ) {
    throw new Error("Customer payment accounting failed.");
  }

  console.log("Customer payment accounting passed.");

  // ------------------------------------------------------------
  // WORKER PAYMENT
  // ------------------------------------------------------------

  const worker = await workerService.create({
    name: `__TEST_PAYMENT_WORKER_${now}__`,
    phone: "0000000000",
    employmentDate: now,
    position: "Butcher",
    startingSalary: 5000,
    monthlySalary: 50000,
  });

  await db.workers.update(worker.id, {
    balance: 3000,
  });

  const workerAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_PAYMENT_WORKER_ACCOUNT_${now}__`,
    initialBalance: 5000,
  });

  const workerPayment = await paymentOperation.create({
    entityType: "worker",
    entityId: worker.id,
    accountId: workerAccount.id,
    amount: 1000,
    date: now,
    note: "Worker payment test",
  });

  const updatedWorker = await db.workers.get(worker.id);
  const updatedWorkerAccount = await db.bankAccounts.get(
    workerAccount.id,
  );
  const storedWorkerPayment = await db.payments.get(
    workerPayment.id,
  );

  if (
    !updatedWorker ||
    updatedWorker.balance !== 2000 ||
    !updatedWorkerAccount ||
    updatedWorkerAccount.balance !== 4000 ||
    !storedWorkerPayment ||
    storedWorkerPayment.entityType !== "worker" ||
    storedWorkerPayment.entityId !== worker.id ||
    storedWorkerPayment.accountId !== workerAccount.id ||
    storedWorkerPayment.amount !== 1000
  ) {
    throw new Error("Worker payment accounting failed.");
  }

  console.log("Worker payment accounting passed.");

  // ------------------------------------------------------------
  // EXPENSE PAYMENT
  // ------------------------------------------------------------

  const expenseAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_PAYMENT_EXPENSE_ACCOUNT_${now}__`,
    initialBalance: 5000,
  });

  const expense = await expenseService.create({
    accountId: expenseAccount.id,
    date: now,
    name: `__TEST_PAYMENT_EXPENSE_${now}__`,
    amount: 1000,
  });

  const expensePayment = await paymentOperation.create({
    entityType: "expense",
    entityId: expense.id,
    accountId: expenseAccount.id,
    amount: 1000,
    date: now,
    note: "Expense payment test",
  });

  const updatedExpenseAccount = await db.bankAccounts.get(
    expenseAccount.id,
  );
  const storedExpensePayment = await db.payments.get(
    expensePayment.id,
  );

  if (
    !updatedExpenseAccount ||
    updatedExpenseAccount.balance !== 4000 ||
    !storedExpensePayment ||
    storedExpensePayment.entityType !== "expense" ||
    storedExpensePayment.entityId !== expense.id ||
    storedExpensePayment.accountId !== expenseAccount.id ||
    storedExpensePayment.amount !== 1000
  ) {
    throw new Error("Expense payment accounting failed.");
  }

  console.log("Expense payment accounting passed.");

  // ------------------------------------------------------------
  // INVALID AMOUNT
  // ------------------------------------------------------------

  const invalidAmountAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_PAYMENT_INVALID_AMOUNT_ACCOUNT_${now}__`,
    initialBalance: 5000,
  });

  const beforeInvalidAmount = await db.bankAccounts.get(
    invalidAmountAccount.id,
  );

  if (!beforeInvalidAmount) {
    throw new Error("Invalid amount account disappeared.");
  }

  try {
    await paymentOperation.create({
      entityType: "supplier",
      entityId: supplier.id,
      accountId: invalidAmountAccount.id,
      amount: 0,
      date: now,
    });

    throw new Error("Zero payment amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Payment amount must be greater than zero."
    ) {
      console.log("Invalid payment amount rejection passed.");
    } else {
      throw error;
    }
  }

  const afterInvalidAmount = await db.bankAccounts.get(
    invalidAmountAccount.id,
  );

  if (
    !afterInvalidAmount ||
    afterInvalidAmount.balance !== beforeInvalidAmount.balance
  ) {
    throw new Error("Invalid payment changed account balance.");
  }

  // ------------------------------------------------------------
  // MISSING ACCOUNT
  // ------------------------------------------------------------

  try {
    await paymentOperation.create({
      entityType: "supplier",
      entityId: supplier.id,
      accountId: "__NON_EXISTENT_ACCOUNT__",
      amount: 100,
      date: now,
    });

    throw new Error("Missing account was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Account not found."
    ) {
      console.log("Missing account rejection passed.");
    } else {
      throw error;
    }
  }

  // ------------------------------------------------------------
  // INSUFFICIENT ACCOUNT BALANCE
  // ------------------------------------------------------------

  const insufficientAccount = await bankAccountService.create({
    type: "cash",
    name: `__TEST_PAYMENT_INSUFFICIENT_${now}__`,
    initialBalance: 100,
  });

  const supplierBeforeInsufficient = await db.suppliers.get(
    supplier.id,
  );
  const accountBeforeInsufficient = await db.bankAccounts.get(
    insufficientAccount.id,
  );

  if (!supplierBeforeInsufficient || !accountBeforeInsufficient) {
    throw new Error("Insufficient balance setup failed.");
  }

  try {
    await paymentOperation.create({
      entityType: "supplier",
      entityId: supplier.id,
      accountId: insufficientAccount.id,
      amount: 500,
      date: now,
    });

    throw new Error("Insufficient account balance was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Insufficient account balance."
    ) {
      console.log("Insufficient account balance rejection passed.");
    } else {
      throw error;
    }
  }

  const supplierAfterInsufficient = await db.suppliers.get(
    supplier.id,
  );
  const accountAfterInsufficient = await db.bankAccounts.get(
    insufficientAccount.id,
  );

  if (
    !supplierAfterInsufficient ||
    supplierAfterInsufficient.balance !==
      supplierBeforeInsufficient.balance ||
    !accountAfterInsufficient ||
    accountAfterInsufficient.balance !==
      accountBeforeInsufficient.balance
  ) {
    throw new Error(
      "Insufficient account balance changed financial state.",
    );
  }

  // ------------------------------------------------------------
  // ENTITY BALANCE PROTECTION
  // ------------------------------------------------------------

  try {
    await paymentOperation.create({
      entityType: "supplier",
      entityId: supplier.id,
      accountId: supplierAccount.id,
      amount: 2500,
      date: now,
    });

    throw new Error("Supplier balance limit was bypassed.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Payment exceeds supplier balance."
    ) {
      console.log("Supplier balance protection passed.");
    } else {
      throw error;
    }
  }

  try {
    await paymentOperation.create({
      entityType: "customer",
      entityId: customer.id,
      accountId: customerAccount.id,
      amount: 2500,
      date: now,
    });

    throw new Error("Customer balance limit was bypassed.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Payment exceeds customer balance."
    ) {
      console.log("Customer balance protection passed.");
    } else {
      throw error;
    }
  }

  try {
    await paymentOperation.create({
      entityType: "worker",
      entityId: worker.id,
      accountId: workerAccount.id,
      amount: 2500,
      date: now,
    });

    throw new Error("Worker balance limit was bypassed.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Payment exceeds worker balance."
    ) {
      console.log("Worker balance protection passed.");
    } else {
      throw error;
    }
  }

  // ------------------------------------------------------------
  // ARCHIVED WORKER
  // ------------------------------------------------------------

  await db.workers.update(worker.id, {
    status: "archived",
  });

  try {
    await paymentOperation.create({
      entityType: "worker",
      entityId: worker.id,
      accountId: workerAccount.id,
      amount: 100,
      date: now,
    });

    throw new Error("Archived worker received a payment.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Archived worker cannot receive payments."
    ) {
      console.log("Archived worker payment rejection passed.");
    } else {
      throw error;
    }
  }

  // ------------------------------------------------------------
  // MISSING ENTITIES
  // ------------------------------------------------------------

  try {
    await paymentOperation.create({
      entityType: "supplier",
      entityId: "__NON_EXISTENT_SUPPLIER__",
      accountId: supplierAccount.id,
      amount: 100,
      date: now,
    });

    throw new Error("Missing supplier was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Supplier not found."
    ) {
      console.log("Missing supplier rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await paymentOperation.create({
      entityType: "customer",
      entityId: "__NON_EXISTENT_CUSTOMER__",
      accountId: customerAccount.id,
      amount: 100,
      date: now,
    });

    throw new Error("Missing customer was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Customer not found."
    ) {
      console.log("Missing customer rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await paymentOperation.create({
      entityType: "worker",
      entityId: "__NON_EXISTENT_WORKER__",
      accountId: workerAccount.id,
      amount: 100,
      date: now,
    });

    throw new Error("Missing worker was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker not found."
    ) {
      console.log("Missing worker rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await paymentOperation.create({
      entityType: "expense",
      entityId: "__NON_EXISTENT_EXPENSE__",
      accountId: expenseAccount.id,
      amount: 100,
      date: now,
    });

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

  console.log("Payment operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Payment operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

