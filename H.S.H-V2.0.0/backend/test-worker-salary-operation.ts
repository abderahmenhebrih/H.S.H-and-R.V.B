import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { workerService } from "../frontend/src/services/worker.service";
import { workerSalaryOperation } from "../frontend/src/services/operations/worker-salary.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const worker = await workerService.create({
    name: `__TEST_WORKER_SALARY_${now}__`,
    phone: "0000000000",
    employmentDate: now,
    position: "Butcher",
    startingSalary: 5000,
    monthlySalary: 50000,
  });

  await db.workers.update(worker.id, {
    balance: 3000,
  });

  let currentWorker = await db.workers.get(worker.id);

  if (!currentWorker || currentWorker.balance !== 3000) {
    throw new Error("Initial worker salary setup failed.");
  }

  console.log("Initial worker salary setup passed.");

  // Normal salary accrual
  const result = await workerSalaryOperation.accrue({
    workerId: worker.id,
    amount: 5000,
  });

  currentWorker = await db.workers.get(worker.id);

  if (
    !result ||
    !currentWorker ||
    currentWorker.balance !== 8000
  ) {
    throw new Error("Worker salary accrual failed.");
  }

  console.log("Worker salary accrual passed.");

  // Multiple salary accruals
  await workerSalaryOperation.accrue({
    workerId: worker.id,
    amount: 2000,
  });

  currentWorker = await db.workers.get(worker.id);

  if (!currentWorker || currentWorker.balance !== 10000) {
    throw new Error("Multiple salary accrual failed.");
  }

  console.log("Multiple salary accrual passed.");

  // Zero salary
  const balanceBeforeZero = currentWorker.balance;

  try {
    await workerSalaryOperation.accrue({
      workerId: worker.id,
      amount: 0,
    });

    throw new Error("Zero salary amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Salary amount must be greater than zero."
    ) {
      console.log("Zero salary rejection passed.");
    } else {
      throw error;
    }
  }

  currentWorker = await db.workers.get(worker.id);

  if (
    !currentWorker ||
    currentWorker.balance !== balanceBeforeZero
  ) {
    throw new Error(
      "Failed zero salary operation changed worker balance.",
    );
  }

  // Negative salary
  const balanceBeforeNegative = currentWorker.balance;

  try {
    await workerSalaryOperation.accrue({
      workerId: worker.id,
      amount: -1000,
    });

    throw new Error("Negative salary amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Salary amount must be greater than zero."
    ) {
      console.log("Negative salary rejection passed.");
    } else {
      throw error;
    }
  }

  currentWorker = await db.workers.get(worker.id);

  if (
    !currentWorker ||
    currentWorker.balance !== balanceBeforeNegative
  ) {
    throw new Error(
      "Failed negative salary operation changed worker balance.",
    );
  }

  // Missing worker
  try {
    await workerSalaryOperation.accrue({
      workerId: "__NON_EXISTENT_WORKER__",
      amount: 5000,
    });

    throw new Error("Missing worker salary was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker not found."
    ) {
      console.log("Missing worker salary rejection passed.");
    } else {
      throw error;
    }
  }

  console.log("Worker salary operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Worker salary operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

