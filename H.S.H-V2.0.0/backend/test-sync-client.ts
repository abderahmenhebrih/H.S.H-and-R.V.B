import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import {
  queueSyncOperation,
  getPendingSyncOperations,
} from "../frontend/src/services/sync/queue";
import { syncPendingOperations } from "../frontend/src/services/sync/client";

async function main() {
  await db.delete();
  await db.open();

  const customerId = `__SYNC_CLIENT_E2E_${Date.now()}__`;

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
      balance: 0,
    },
  });

  let pending = await getPendingSyncOperations();

  if (pending.length !== 1) {
    throw new Error(
      `Expected 1 pending operation, found ${pending.length}.`,
    );
  }

  console.log("Pending operation setup passed.");

  const response = await syncPendingOperations();

  if (
    !response.success ||
    response.results.length !== 1 ||
    !response.results[0].success
  ) {
    throw new Error(
      `Sync client request failed: ${response.results[0]?.message ?? "Unknown error"}`,
    );
  }

  console.log("Sync client request passed.");

  pending = await getPendingSyncOperations();

  if (pending.length !== 0) {
    throw new Error(
      `Expected 0 pending operations after successful sync, found ${pending.length}.`,
    );
  }

  console.log("Successful operation marked as synced.");

  const allOperations = await db.syncOperations.toArray();

  // Successful operations are pruned after sync
  if (allOperations.length !== 0) {
    throw new Error(
      `Sync operation should have been pruned after success, found ${allOperations.length} remaining.`,
    );
  }

  console.log("Sync state persistence passed (pruned).");

  db.close();

  console.log("Sync client integration test passed.");
}

main().catch((error) => {
  console.error("Sync client integration test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

