import "fake-indexeddb/auto";

import {
  connectDatabase,
  disconnectDatabase,
} from "./src/config/database";
import { CustomerModel } from "./src/models/customer.model";
import { db } from "../frontend/src/lib/database/db";
import { queueSyncOperation } from "../frontend/src/services/sync/queue";
import { syncPendingOperations } from "../frontend/src/services/sync/client";

async function main() {
  await connectDatabase();

  await db.delete();
  await db.open();

  const customerId = `__FULL_SYNC_${Date.now()}__`;

  await CustomerModel.deleteOne({
    id: customerId,
  });

  // 1. Create operation locally.
  await queueSyncOperation({
    entity: "customer",
    entityId: customerId,
    operation: "create",
    payload: {
      id: customerId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: "pending",
      name: customerId,
      phone: "0000000000",
      type: "regular",
      balance: 1000,
    },
  });

  console.log("Local sync queue creation passed.");

  // 2. Send local queue to backend.
  const createResponse = await syncPendingOperations();

  if (
    !createResponse.success ||
    createResponse.results.length !== 1 ||
    !createResponse.results[0].success
  ) {
    throw new Error("Full create synchronization failed.");
  }

  console.log("Local → backend create sync passed.");

  // 3. Verify MongoDB.
  let customer = await CustomerModel.findOne({
    id: customerId,
  });

  if (
    !customer ||
    customer.name !== customerId ||
    customer.balance !== 1000 ||
    customer.syncStatus !== "synced" ||
    !customer.lastSyncedAt
  ) {
    throw new Error(
      "MongoDB did not contain the correctly synchronized customer.",
    );
  }

  console.log("MongoDB create persistence passed.");

  // 4. Verify local queue is synced (pruned).
  let pending = await db.syncOperations
    .toArray();

  if (pending.length !== 0) {
    throw new Error(
      `Local sync operation should have been pruned after sync, found ${pending.length}.`,
    );
  }

  console.log("Local sync state update passed (pruned).");

  // 5. Queue an update.
  await queueSyncOperation({
    entity: "customer",
    entityId: customerId,
    operation: "update",
    payload: {
      name: `${customerId}_UPDATED`,
      phone: "1111111111",
      balance: 2500,
      updatedAt: Date.now(),
      syncStatus: "pending",
    },
  });

  const updateResponse = await syncPendingOperations();

  if (
    !updateResponse.success ||
    updateResponse.results.length !== 1 ||
    !updateResponse.results[0].success
  ) {
    throw new Error("Full update synchronization failed.");
  }

  console.log("Local → backend update sync passed.");

  customer = await CustomerModel.findOne({
    id: customerId,
  });

  if (
    !customer ||
    customer.name !== `${customerId}_UPDATED` ||
    customer.phone !== "1111111111" ||
    customer.balance !== 2500 ||
    customer.syncStatus !== "synced"
  ) {
    throw new Error(
      "MongoDB update synchronization was incorrect.",
    );
  }

  console.log("MongoDB update persistence passed.");

  // 6. Queue deletion.
  await queueSyncOperation({
    entity: "customer",
    entityId: customerId,
    operation: "delete",
    payload: {},
  });

  const deleteResponse = await syncPendingOperations();

  if (
    !deleteResponse.success ||
    deleteResponse.results.length !== 1 ||
    !deleteResponse.results[0].success
  ) {
    throw new Error("Full delete synchronization failed.");
  }

  console.log("Local → backend delete sync passed.");

  // 7. Verify MongoDB deletion.
  customer = await CustomerModel.findOne({
    id: customerId,
  });

  if (customer) {
    throw new Error(
      "Customer still exists after synchronized deletion.",
    );
  }

  console.log("MongoDB delete persistence passed.");

  // 8. Every local operation should be pruned after sync.
  pending = await db.syncOperations
    .toArray();

  if (pending.length !== 0) {
    throw new Error(
      `Expected all operations to be pruned after sync, found ${pending.length}.`,
    );
  }

  console.log("Complete local sync state passed (pruned).");

  await disconnectDatabase();
  db.close();

  console.log("Full synchronization test passed.");
}

main().catch(async (error) => {
  console.error("Full synchronization test failed.");
  console.error(error instanceof Error ? error.message : error);

  try {
    await disconnectDatabase();
  } catch {}

  try {
    db.close();
  } catch {}

  process.exit(1);
});

