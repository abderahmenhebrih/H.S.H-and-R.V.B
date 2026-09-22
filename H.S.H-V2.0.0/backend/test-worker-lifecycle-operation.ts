import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { workerService } from "../frontend/src/services/worker.service";
import { workerLifecycleOperation } from "../frontend/src/services/operations/worker-lifecycle.operation";
import { workerBalanceOperation } from "../frontend/src/services/operations/worker-balance.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const worker = await workerService.create({
    name: `__TEST_WORKER_LIFECYCLE_${now}__`,
    phone: "0000000000",
    employmentDate: now,
    position: "Butcher",
    startingSalary: 5000,
    monthlySalary: 50000,
  });

  let current = await db.workers.get(worker.id);

  if (!current || current.status !== "active") {
    throw new Error("Worker was not created as active.");
  }

  console.log("Worker active state passed.");

  // Starting balance is now initialized to startingSalary (5000), so clear before archive test
  await db.workers.update(worker.id, { balance: 0 });

  await workerLifecycleOperation.archive(worker.id);

  current = await db.workers.get(worker.id);

  if (!current || current.status !== "archived") {
    throw new Error("Worker was not archived.");
  }

  console.log("Worker archive passed.");

  try {
    await workerLifecycleOperation.archive(worker.id);

    throw new Error("Already archived worker was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker is already archived."
    ) {
      console.log("Duplicate archive rejection passed.");
    } else {
      throw error;
    }
  }

  await workerLifecycleOperation.restore({
    workerId: worker.id,
    startingSalary: 7000,
    monthlySalary: 60000,
  });

  current = await db.workers.get(worker.id);

  if (
    !current ||
    current.status !== "active" ||
    current.startingSalary !== 7000 ||
    current.monthlySalary !== 60000
  ) {
    throw new Error("Worker restore failed.");
  }

  console.log("Worker restore passed.");

  await workerBalanceOperation.addBonus({
    workerId: worker.id,
    amount: 10000,
    date: now,
  });

  current = await db.workers.get(worker.id);

  if (!current || current.balance !== 10000) {
    throw new Error("Worker balance setup failed.");
  }

  try {
    await workerLifecycleOperation.archive(worker.id);

    throw new Error("Worker with non-zero balance was archived.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Cannot archive worker while the worker balance is not zero."
    ) {
      console.log("Non-zero balance archive protection passed.");
    } else {
      throw error;
    }
  }

  current = await db.workers.get(worker.id);

  if (
    !current ||
    current.status !== "active" ||
    current.balance !== 10000
  ) {
    throw new Error(
      "Failed archive changed worker financial/lifecycle state.",
    );
  }

  console.log("Failed archive state preservation passed.");

  try {
    await workerLifecycleOperation.restore({
      workerId: worker.id,
      startingSalary: 8000,
      monthlySalary: 70000,
    });

    throw new Error("Already active worker was restored.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker is already active."
    ) {
      console.log("Duplicate restore rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await workerLifecycleOperation.restore({
      workerId: "__NON_EXISTENT_WORKER__",
      startingSalary: 5000,
      monthlySalary: 50000,
    });

    throw new Error("Missing worker was restored.");
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
    await workerLifecycleOperation.restore({
      workerId: worker.id,
      startingSalary: -1,
      monthlySalary: 50000,
    });

    throw new Error("Negative starting salary was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Starting salary cannot be negative."
    ) {
      console.log("Negative starting salary rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await workerLifecycleOperation.restore({
      workerId: worker.id,
      startingSalary: 5000,
      monthlySalary: -1,
    });

    throw new Error("Negative monthly salary was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Monthly salary cannot be negative."
    ) {
      console.log("Negative monthly salary rejection passed.");
    } else {
      throw error;
    }
  }

  console.log("Worker lifecycle operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Worker lifecycle operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

