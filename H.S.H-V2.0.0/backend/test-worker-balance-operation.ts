import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { workerService } from "../frontend/src/services/worker.service";
import { workerBalanceOperation } from "../frontend/src/services/operations/worker-balance.operation";
import { workerLifecycleOperation } from "../frontend/src/services/operations/worker-lifecycle.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const worker = await workerService.create({
    name: `__TEST_WORKER_BALANCE_${now}__`,
    phone: "0000000000",
    employmentDate: now,
    position: "Butcher",
    startingSalary: 5000,
    monthlySalary: 50000,
  });

  await db.workers.update(worker.id, {
    balance: 5000,
  });

  let current = await db.workers.get(worker.id);

  if (!current || current.balance !== 5000) {
    throw new Error("Initial worker balance setup failed.");
  }

  console.log("Initial worker balance passed.");

  // Bonus
  await workerBalanceOperation.addBonus({
    workerId: worker.id,
    date: now,
    amount: 2000,
  });

  current = await db.workers.get(worker.id);

  if (!current || current.balance !== 7000) {
    throw new Error("Worker bonus accounting failed.");
  }

  console.log("Worker bonus accounting passed.");

  // Absence
  await workerBalanceOperation.addAbsence({
    workerId: worker.id,
    date: now + 1,
    amount: 1500,
  });

  current = await db.workers.get(worker.id);

  if (!current || current.balance !== 5500) {
    throw new Error("Worker absence accounting failed.");
  }

  console.log("Worker absence accounting passed.");

  // Zero bonus
  try {
    await workerBalanceOperation.addBonus({
      workerId: worker.id,
      date: now,
      amount: 0,
    });

    throw new Error("Zero bonus amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Bonus amount must be greater than zero."
    ) {
      console.log("Zero bonus rejection passed.");
    } else {
      throw error;
    }
  }

  // Negative bonus
  try {
    await workerBalanceOperation.addBonus({
      workerId: worker.id,
      date: now,
      amount: -100,
    });

    throw new Error("Negative bonus amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Bonus amount must be greater than zero."
    ) {
      console.log("Negative bonus rejection passed.");
    } else {
      throw error;
    }
  }

  // Zero absence
  try {
    await workerBalanceOperation.addAbsence({
      workerId: worker.id,
      date: now,
      amount: 0,
    });

    throw new Error("Zero absence amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Absence amount must be greater than zero."
    ) {
      console.log("Zero absence rejection passed.");
    } else {
      throw error;
    }
  }

  // Negative absence
  try {
    await workerBalanceOperation.addAbsence({
      workerId: worker.id,
      date: now,
      amount: -100,
    });

    throw new Error("Negative absence amount was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Absence amount must be greater than zero."
    ) {
      console.log("Negative absence rejection passed.");
    } else {
      throw error;
    }
  }

  // Absence greater than balance
  const balanceBeforeFailure = await db.workers.get(worker.id);

  if (!balanceBeforeFailure) {
    throw new Error("Worker disappeared before balance protection test.");
  }

  try {
    await workerBalanceOperation.addAbsence({
      workerId: worker.id,
      date: now,
      amount: 999999,
    });

    throw new Error(
      "Absence greater than worker balance was accepted.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Absence amount exceeds worker balance."
    ) {
      console.log("Worker absence balance protection passed.");
    } else {
      throw error;
    }
  }

  const balanceAfterFailure = await db.workers.get(worker.id);

  if (
    !balanceAfterFailure ||
    balanceAfterFailure.balance !==
      balanceBeforeFailure.balance
  ) {
    throw new Error(
      "Failed absence operation changed worker balance.",
    );
  }

  console.log("Failed absence state preservation passed.");

  // Missing worker bonus
  try {
    await workerBalanceOperation.addBonus({
      workerId: "__NON_EXISTENT_WORKER__",
      date: now,
      amount: 1000,
    });

    throw new Error("Missing worker bonus was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker not found."
    ) {
      console.log("Missing worker bonus rejection passed.");
    } else {
      throw error;
    }
  }

  // Missing worker absence
  try {
    await workerBalanceOperation.addAbsence({
      workerId: "__NON_EXISTENT_WORKER__",
      date: now,
      amount: 1000,
    });

    throw new Error("Missing worker absence was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker not found."
    ) {
      console.log("Missing worker absence rejection passed.");
    } else {
      throw error;
    }
  }

  // Archived worker protection
  await workerBalanceOperation.addBonus({
    workerId: worker.id,
    date: now,
    amount: 500,
  });

  current = await db.workers.get(worker.id);

  if (!current || current.balance !== 6000) {
    throw new Error("Worker balance setup before archive failed.");
  }

  await workerBalanceOperation.addAbsence({
    workerId: worker.id,
    date: now,
    amount: 6000,
  });

  current = await db.workers.get(worker.id);

  if (!current || current.balance !== 0) {
    throw new Error(
      "Worker balance could not be reduced to zero before archive.",
    );
  }

  await workerLifecycleOperation.archive(worker.id);

  current = await db.workers.get(worker.id);

  if (!current || current.status !== "archived") {
    throw new Error("Worker archive setup failed.");
  }

  try {
    await workerBalanceOperation.addBonus({
      workerId: worker.id,
      date: now,
      amount: 1000,
    });

    throw new Error("Archived worker bonus was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Archived worker cannot receive a bonus."
    ) {
      console.log("Archived worker bonus rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await workerBalanceOperation.addAbsence({
      workerId: worker.id,
      date: now,
      amount: 1000,
    });

    throw new Error("Archived worker absence was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Archived worker cannot receive an absence."
    ) {
      console.log("Archived worker absence rejection passed.");
    } else {
      throw error;
    }
  }

  current = await db.workers.get(worker.id);

  if (!current || current.balance !== 0) {
    throw new Error(
      "Archived worker balance was changed by failed operations.",
    );
  }

  console.log("Archived worker protection passed.");

  console.log("Worker balance operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Worker balance operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

