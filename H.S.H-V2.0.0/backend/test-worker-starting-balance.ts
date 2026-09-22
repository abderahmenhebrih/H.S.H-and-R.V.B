import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { workerService } from "../frontend/src/services/worker.service";
import { workerEditOperation } from "../frontend/src/services/operations/worker-edit.operation";

async function main() {
  // Ensure clean DB state
  try {
    await db.delete();
  } catch {}
  await db.open();

  const now = Date.now();

  console.log("Creating worker with startingSalary 600, monthlySalary 3000 ...");
  const worker = await workerService.create({
    name: `__TEST_WORKER_STARTING_${now}__`,
    phone: "0550526218",
    employmentDate: now,
    position: "Butcher",
    startingSalary: 600,
    monthlySalary: 3000,
  });

  let current = await db.workers.get(worker.id);

  if (!current) {
    throw new Error("Worker not found after creation.");
  }

  console.log(`Created worker balance: ${current.balance}, startingSalary: ${current.startingSalary}`);

  // Business rule: starting salary is one-time for already-started month, so balance should equal startingSalary initially
  if (current.balance !== 600) {
    throw new Error(`Worker balance incorrect after creation. Expected 600 (startingSalary), got ${current.balance}`);
  }

  if (current.startingSalary !== 600) {
    throw new Error(`Starting salary not persisted. Expected 600, got ${current.startingSalary}`);
  }

  if (current.monthlySalary !== 3000) {
    throw new Error(`Monthly salary not persisted. Expected 3000, got ${current.monthlySalary}`);
  }

  console.log("Worker creation balance initialization passed.");

  // Simulate browser refresh: close and reopen DB, fetch again
  db.close();
  await db.open();
  current = await db.workers.get(worker.id);
  if (!current || current.balance !== 600) {
    throw new Error(`Worker balance not persisted after reopen. Expected 600, got ${current?.balance}`);
  }
  console.log("Worker balance persistence after reopen passed.");

  // Edit worker - balance should be preserved, salaries updated
  await workerEditOperation.edit({
    workerId: worker.id,
    name: current.name,
    phone: current.phone,
    employmentDate: current.employmentDate,
    position: current.position,
    startingSalary: 700,
    monthlySalary: 3500,
  });

  current = await db.workers.get(worker.id);
  if (!current) throw new Error("Worker not found after edit.");
  // Edit should preserve balance (financial state), not reset to new startingSalary
  if (current.balance !== 600) {
    throw new Error(`Worker balance incorrectly modified on edit. Expected preserved 600, got ${current.balance}`);
  }
  if (current.startingSalary !== 700 || current.monthlySalary !== 3500) {
    throw new Error(`Worker salaries not updated on edit. Got ${current.startingSalary}/${current.monthlySalary}`);
  }
  console.log("Worker edit preserves balance passed.");

  // Verify table display would show correct balance via service
  const all = await workerService.getAll();
  const found = all.find((w) => w.id === worker.id);
  if (!found || found.balance !== 600) {
    throw new Error(`Worker service getAll returned incorrect balance. Expected 600, got ${found?.balance}`);
  }
  console.log("Worker service getAll balance passed.");

  // Test zero starting salary case
  const zeroWorker = await workerService.create({
    name: `__TEST_WORKER_ZERO_${now}__`,
    phone: "0000000001",
    employmentDate: now,
    position: "Driver",
    startingSalary: 0,
    monthlySalary: 2000,
  });
  const zeroCurrent = await db.workers.get(zeroWorker.id);
  if (!zeroCurrent || zeroCurrent.balance !== 0) {
    throw new Error(`Zero starting salary worker should have balance 0, got ${zeroCurrent?.balance}`);
  }
  console.log("Zero starting salary case passed.");

  console.log("Worker starting balance regression test passed.");
  db.close();
}

main().catch((error) => {
  console.error("Worker starting balance regression test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

