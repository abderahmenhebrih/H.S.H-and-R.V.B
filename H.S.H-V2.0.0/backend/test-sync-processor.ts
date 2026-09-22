import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { queueSyncOperation, getPendingSyncOperations } from "../frontend/src/services/sync/queue";
import { processPendingSyncQueue } from "../frontend/src/services/sync/processor";

async function main() {
  await db.delete();
  await db.open();

  const customerId = `__SYNC_PROCESSOR_${Date.now()}__`;

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
      `Expected 1 pending operation, found ${before.length}.`,
    );
  }

  console.log("Processor queue setup passed.");

  await processPendingSyncQueue();

  const after = await getPendingSyncOperations();

  if (after.length !== 0) {
    throw new Error(
      `Expected 0 pending operations after processing, found ${after.length}.`,
    );
  }

  const stored = await db.syncOperations.toArray();

  // Successful operations are pruned (deleted) after sync
  if (stored.length !== 0) {
    throw new Error(
      `Processor should have pruned successful operation, found ${stored.length} remaining.`,
    );
  }

  console.log("Processor successful synchronization passed (pruned).");

  db.close();

  console.log("Sync processor test passed.");
}

main().catch((error) => {
  console.error("Sync processor test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

