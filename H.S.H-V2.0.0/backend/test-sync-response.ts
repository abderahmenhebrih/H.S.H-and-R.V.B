import "dotenv/config";

import { connectDatabase, disconnectDatabase } from "./src/config/database";
import { processSyncOperations } from "./src/sync/sync-service";

async function main() {
  await connectDatabase();

  // Empty batch
  const empty = await processSyncOperations([]);

  if (empty.length !== 0) {
    throw new Error("Empty sync batch returned unexpected results.");
  }

  console.log("Empty sync batch passed.");

  // Successful batch
  const customerId = `__SYNC_RESPONSE_${Date.now()}__`;

  const successful = await processSyncOperations([
    {
      entity: "customer",
      entityId: customerId,
      operation: "create",
      operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
      createdAt: Date.now(),
      payload: {
        id: customerId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        syncStatus: "synced",
        name: customerId,
        phone: "0000000000",
        type: "regular",
        balance: 0,
      },
    },
  ]);

  if (
    successful.length !== 1 ||
    !successful[0].success ||
    successful[0].entity !== "customer" ||
    successful[0].entityId !== customerId ||
    successful[0].operation !== "create"
  ) {
    throw new Error("Successful sync response failed.");
  }

  console.log("Successful sync response passed.");

  // Failed operation must be represented in its result.
  const failed = await processSyncOperations([
    {
      entity: "customer",
      entityId: "__NON_EXISTENT_CUSTOMER__",
      operation: "update",
      operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
      createdAt: Date.now(),
      payload: {
        name: "Should Fail",
      },
    },
  ]);

  if (
    failed.length !== 1 ||
    failed[0].success ||
    failed[0].message !== "Entity not found."
  ) {
    throw new Error("Failed sync response failed.");
  }

  console.log("Failed sync response passed.");

  // Unsupported entity must become a failed result.
  const unsupported = await processSyncOperations([
    {
      entity: "__unsupported_entity__",
      entityId: "test",
      operation: "create",
      operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
      createdAt: Date.now(),
      payload: {},
    },
  ]);

  if (
    unsupported.length !== 1 ||
    unsupported[0].success ||
    unsupported[0].message !==
      "Unsupported sync entity: __unsupported_entity__"
  ) {
    throw new Error("Unsupported entity response failed.");
  }

  console.log("Unsupported entity response passed.");

  await disconnectDatabase();

  console.log("Sync response protocol test passed.");
}

main().catch(async (error) => {
  console.error("Sync response protocol test failed.");
  console.error(error instanceof Error ? error.message : error);

  try {
    await disconnectDatabase();
  } catch {}

  process.exit(1);
});

