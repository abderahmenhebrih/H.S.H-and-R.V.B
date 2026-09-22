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

  const customerId = `__SYNC_RETRY_${Date.now()}__`;

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

  const before = await getPendingSyncOperations();

  if (before.length !== 1) {
    throw new Error(
      `Expected 1 pending operation before retry test, found ${before.length}.`,
    );
  }

  console.log("Retry queue setup passed.");

  // Force a network failure by using an unavailable port.
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => {
    throw new Error("Simulated network failure.");
  };

  try {
    await syncPendingOperations();

    throw new Error(
      "Sync unexpectedly succeeded during simulated network failure.",
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Sync request failed: Simulated network failure."
    ) {
      console.log("Network failure handling passed.");
    } else {
      throw error;
    }
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Failed synchronization must leave the operation pending.
  const afterFailure = await getPendingSyncOperations();

  if (afterFailure.length !== 1) {
    throw new Error(
      `Expected operation to remain pending after failure, found ${afterFailure.length}.`,
    );
  }

  if (afterFailure[0].synced !== false) {
    throw new Error(
      "Failed synchronization incorrectly marked operation as synced.",
    );
  }

  console.log("Failed synchronization preservation passed.");

  db.close();

  console.log("Sync retry/failure test passed.");
}

main().catch((error) => {
  console.error("Sync retry/failure test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

