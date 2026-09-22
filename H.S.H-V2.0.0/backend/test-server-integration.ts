import "dotenv/config";

import {
  connectDatabase,
  disconnectDatabase,
} from "./src/config/database";
import { CustomerModel } from "./src/models/customer.model";
import { processSyncOperations } from "./src/sync/sync-service";

async function main() {
  await connectDatabase();

  const customerId = `__SERVER_INTEGRATION_${Date.now()}__`;

  await CustomerModel.deleteOne({
    id: customerId,
  });

  // Verify the same synchronization layer used by /api/sync.
  const result = await processSyncOperations([
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
        syncStatus: "pending",
        name: customerId,
        phone: "0000000000",
        type: "regular",
        balance: 0,
      },
    },
  ]);

  if (
    result.length !== 1 ||
    !result[0].success ||
    result[0].entity !== "customer" ||
    result[0].entityId !== customerId ||
    result[0].operation !== "create"
  ) {
    throw new Error("Server synchronization processing failed.");
  }

  const customer = await CustomerModel.findOne({
    id: customerId,
  });

  if (
    !customer ||
    customer.name !== customerId ||
    customer.syncStatus !== "synced" ||
    !customer.lastSyncedAt
  ) {
    throw new Error(
      "Server synchronization did not persist the customer correctly.",
    );
  }

  console.log("Server synchronization integration passed.");

  await CustomerModel.deleteOne({
    id: customerId,
  });

  await disconnectDatabase();

  console.log("Backend server integration test passed.");
}

main().catch(async (error) => {
  console.error("Backend server integration test failed.");
  console.error(error instanceof Error ? error.message : error);

  try {
    await disconnectDatabase();
  } catch {}

  process.exit(1);
});

