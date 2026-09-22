import "dotenv/config";

import {
  connectDatabase,
  disconnectDatabase,
} from "./src/config/database";
import { CustomerModel } from "./src/models/customer.model";
import { processSyncOperation } from "./src/sync/sync-service";

async function main() {
  await connectDatabase();

  const customerId = `__SYNC_STATUS_${Date.now()}__`;

  await CustomerModel.deleteOne({
    id: customerId,
  });

  // CREATE → synced
  const createResult = await processSyncOperation({
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
  });

  if (!createResult.success) {
    throw new Error(
      `Create synchronization failed: ${createResult.message}`,
    );
  }

  let customer = await CustomerModel.findOne({
    id: customerId,
  });

  if (
    !customer ||
    customer.syncStatus !== "synced" ||
    !customer.lastSyncedAt
  ) {
    throw new Error(
      "Successful create did not update sync status correctly.",
    );
  }

  console.log("Create sync status passed.");

  const firstSyncedAt = customer.lastSyncedAt;

  // UPDATE → synced + new timestamp
  await new Promise((resolve) => setTimeout(resolve, 5));

  const updateResult = await processSyncOperation({
    entity: "customer",
    entityId: customerId,
    operation: "update",
    operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    createdAt: Date.now(),
    payload: {
      name: `${customerId}_UPDATED`,
      phone: "1111111111",
      balance: 2500,
      updatedAt: Date.now(),
      syncStatus: "pending",
    },
  });

  if (!updateResult.success) {
    throw new Error(
      `Update synchronization failed: ${updateResult.message}`,
    );
  }

  customer = await CustomerModel.findOne({
    id: customerId,
  });

  if (
    !customer ||
    customer.syncStatus !== "synced" ||
    !customer.lastSyncedAt ||
    customer.lastSyncedAt < firstSyncedAt ||
    customer.name !== `${customerId}_UPDATED`
  ) {
    throw new Error(
      "Successful update did not update sync status correctly.",
    );
  }

  console.log("Update sync status passed.");

  // Force a failure using an invalid entity.
  const failedResult = await processSyncOperation({
    entity: "__unsupported_entity__",
    entityId: customerId,
    operation: "update",
    operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    createdAt: Date.now(),
    payload: {
      name: "Should Fail",
    },
  });

  if (
    failedResult.success ||
    failedResult.message !==
      "Unsupported sync entity: __unsupported_entity__"
  ) {
    throw new Error(
      "Failed synchronization did not return the expected failure.",
    );
  }

  console.log("Failed synchronization result passed.");

  // The invalid entity cannot have its status updated because
  // there is no model. Verify the real customer remains synced.
  customer = await CustomerModel.findOne({
    id: customerId,
  });

  if (!customer || customer.syncStatus !== "synced") {
    throw new Error(
      "Failed synchronization incorrectly changed the customer status.",
    );
  }

  console.log("Failed synchronization status preservation passed.");

  await CustomerModel.deleteOne({
    id: customerId,
  });

  await disconnectDatabase();

  console.log("Sync status test passed.");
}

main().catch(async (error) => {
  console.error("Sync status test failed.");
  console.error(error instanceof Error ? error.message : error);

  try {
    await disconnectDatabase();
  } catch {}

  process.exit(1);
});

