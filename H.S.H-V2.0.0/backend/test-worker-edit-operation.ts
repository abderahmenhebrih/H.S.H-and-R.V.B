import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { workerService } from "../frontend/src/services/worker.service";
import { workerEditOperation } from "../frontend/src/services/operations/worker-edit.operation";
import { workerBalanceOperation } from "../frontend/src/services/operations/worker-balance.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const worker = await workerService.create({
    name: `__TEST_WORKER_EDIT_${now}__`,
    phone: "1111111111",
    address: "Original address",
    birthDate: now - 25 * 365 * 24 * 60 * 60 * 1000,
    employmentDate: now - 365 * 24 * 60 * 60 * 1000,
    position: "Butcher",
    notes: "Original notes",
    startingSalary: 5000,
    monthlySalary: 50000,
  });

  const secondWorker = await workerService.create({
    name: `__TEST_WORKER_EDIT_OTHER_${now}__`,
    phone: "2222222222",
    employmentDate: now,
    position: "Driver",
    startingSalary: 3000,
    monthlySalary: 30000,
  });

  await workerEditOperation.edit({
    workerId: worker.id,
    name: `__TEST_WORKER_EDITED_${now}__`,
    phone: "3333333333",
    address: "Edited address",
    birthDate: now - 30 * 365 * 24 * 60 * 60 * 1000,
    employmentDate: now - 2 * 365 * 24 * 60 * 60 * 1000,
    position: "Manager",
    notes: "Edited notes",
    startingSalary: 7000,
    monthlySalary: 60000,
  });

  let updated = await db.workers.get(worker.id);

  if (
    !updated ||
    updated.name !== `__TEST_WORKER_EDITED_${now}__` ||
    updated.phone !== "3333333333" ||
    updated.address !== "Edited address" ||
    updated.position !== "Manager" ||
    updated.notes !== "Edited notes" ||
    updated.startingSalary !== 7000 ||
    updated.monthlySalary !== 60000 ||
    updated.status !== "active" ||
    updated.balance !== 5000
  ) {
    throw new Error("Worker edit persistence failed.");
  }

  console.log("Worker edit persistence passed.");

  // Verify the financial balance is preserved by a profile edit.
  await workerBalanceOperation.addBonus({
    workerId: worker.id,
    amount: 10000,
    date: now,
  });

  updated = await db.workers.get(worker.id);

  if (!updated || updated.balance !== 15000) {
    throw new Error("Worker balance setup failed.");
  }

  await workerEditOperation.edit({
    workerId: worker.id,
    name: updated.name,
    phone: updated.phone,
    address: "Balance preserved",
    birthDate: updated.birthDate,
    employmentDate: updated.employmentDate,
    position: updated.position,
    notes: updated.notes,
    startingSalary: 8000,
    monthlySalary: 65000,
  });

  updated = await db.workers.get(worker.id);

  if (
    !updated ||
    updated.balance !== 15000 ||
    updated.startingSalary !== 8000 ||
    updated.monthlySalary !== 65000
  ) {
    throw new Error("Worker financial state was incorrectly modified.");
  }

  console.log("Worker balance preservation passed.");

  // Duplicate name.
  try {
    await workerEditOperation.edit({
      workerId: worker.id,
      name: secondWorker.name,
      phone: updated.phone,
      employmentDate: updated.employmentDate,
      position: updated.position,
      startingSalary: updated.startingSalary,
      monthlySalary: updated.monthlySalary,
    });

    throw new Error("Duplicate worker name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A worker with this name already exists."
    ) {
      console.log("Duplicate worker name rejection passed.");
    } else {
      throw error;
    }
  }

  // Empty name.
  try {
    await workerEditOperation.edit({
      workerId: worker.id,
      name: "",
      phone: updated.phone,
      employmentDate: updated.employmentDate,
      position: updated.position,
      startingSalary: updated.startingSalary,
      monthlySalary: updated.monthlySalary,
    });

    throw new Error("Empty worker name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker name is required."
    ) {
      console.log("Empty worker name rejection passed.");
    } else {
      throw error;
    }
  }

  // Empty phone.
  try {
    await workerEditOperation.edit({
      workerId: worker.id,
      name: updated.name,
      phone: "",
      employmentDate: updated.employmentDate,
      position: updated.position,
      startingSalary: updated.startingSalary,
      monthlySalary: updated.monthlySalary,
    });

    throw new Error("Empty worker phone was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker phone is required."
    ) {
      console.log("Empty worker phone rejection passed.");
    } else {
      throw error;
    }
  }

  // Empty position.
  try {
    await workerEditOperation.edit({
      workerId: worker.id,
      name: updated.name,
      phone: updated.phone,
      employmentDate: updated.employmentDate,
      position: "",
      startingSalary: updated.startingSalary,
      monthlySalary: updated.monthlySalary,
    });

    throw new Error("Empty worker position was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker position is required."
    ) {
      console.log("Empty worker position rejection passed.");
    } else {
      throw error;
    }
  }

  // Negative starting salary.
  try {
    await workerEditOperation.edit({
      workerId: worker.id,
      name: updated.name,
      phone: updated.phone,
      employmentDate: updated.employmentDate,
      position: updated.position,
      startingSalary: -1,
      monthlySalary: updated.monthlySalary,
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

  // Negative monthly salary.
  try {
    await workerEditOperation.edit({
      workerId: worker.id,
      name: updated.name,
      phone: updated.phone,
      employmentDate: updated.employmentDate,
      position: updated.position,
      startingSalary: updated.startingSalary,
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

  // Missing worker.
  try {
    await workerEditOperation.edit({
      workerId: "__NON_EXISTENT_WORKER__",
      name: "Should fail",
      phone: "0000000000",
      employmentDate: now,
      position: "Worker",
      startingSalary: 0,
      monthlySalary: 0,
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

  const beforeFailure = await db.workers.get(worker.id);

  if (!beforeFailure) {
    throw new Error("Worker disappeared before rollback test.");
  }

  try {
    await workerEditOperation.edit({
      workerId: worker.id,
      name: "",
      phone: "0000000000",
      employmentDate: now,
      position: "Should fail",
      startingSalary: 0,
      monthlySalary: 0,
    });

    throw new Error("Invalid worker edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Worker name is required."
    ) {
      console.log("Worker failed-edit rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailure = await db.workers.get(worker.id);

  if (
    !afterFailure ||
    afterFailure.name !== beforeFailure.name ||
    afterFailure.phone !== beforeFailure.phone ||
    afterFailure.position !== beforeFailure.position ||
    afterFailure.startingSalary !== beforeFailure.startingSalary ||
    afterFailure.monthlySalary !== beforeFailure.monthlySalary ||
    afterFailure.balance !== beforeFailure.balance ||
    afterFailure.status !== beforeFailure.status
  ) {
    throw new Error("Failed worker edit was not atomic.");
  }

  console.log("Worker edit rollback passed.");
  console.log("Worker edit operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Worker edit operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

