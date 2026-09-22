import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

import { connectDatabase, disconnectDatabase } from "./src/config/database";
import { processSyncOperation } from "./src/sync/sync-service";
import { CustomerModel } from "./src/models/customer.model";

async function main() {
  const customerId = `__SYNC_TEST_CUSTOMER_${Date.now()}__`;

  await connectDatabase();

  await CustomerModel.deleteOne({
    id: customerId,
  });

  // CREATE
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
      syncStatus: "synced",
      name: "Sync Test Customer",
      phone: "0000000000",
      type: "regular",
      balance: 1000,
    },
  });

  if (!createResult.success) {
    throw new Error(
      `Create synchronization failed: ${createResult.message}`,
    );
  }

  const created = await CustomerModel.findOne({
    id: customerId,
  });

  if (
    !created ||
    created.name !== "Sync Test Customer" ||
    created.balance !== 1000
  ) {
    throw new Error("Created customer was not persisted correctly.");
  }

  console.log("Create synchronization passed.");

  // IDEMPOTENT CREATE
  const duplicateCreateResult = await processSyncOperation({
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
      name: "Duplicate Customer",
      phone: "1111111111",
      type: "regular",
      balance: 9999,
    },
  });

  if (
    !duplicateCreateResult.success ||
    duplicateCreateResult.message !== "Entity already exists."
  ) {
    throw new Error("Duplicate create was not handled idempotently.");
  }

  const afterDuplicate = await CustomerModel.findOne({
    id: customerId,
  });

  if (
    !afterDuplicate ||
    afterDuplicate.name !== "Sync Test Customer" ||
    afterDuplicate.balance !== 1000
  ) {
    throw new Error(
      "Duplicate create incorrectly modified the existing entity.",
    );
  }

  console.log("Idempotent create synchronization passed.");

  // UPDATE
  const updateResult = await processSyncOperation({
    entity: "customer",
    entityId: customerId,
    operation: "update",
    operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    createdAt: Date.now(),
    payload: {
      name: "Updated Sync Customer",
      phone: "2222222222",
      balance: 2500,
      updatedAt: Date.now(),
      syncStatus: "synced",
    },
  });

  if (!updateResult.success) {
    throw new Error(
      `Update synchronization failed: ${updateResult.message}`,
    );
  }

  const updated = await CustomerModel.findOne({
    id: customerId,
  });

  if (
    !updated ||
    updated.name !== "Updated Sync Customer" ||
    updated.phone !== "2222222222" ||
    updated.balance !== 2500
  ) {
    throw new Error("Customer update was not persisted correctly.");
  }

  console.log("Update synchronization passed.");

  // UPDATE MISSING ENTITY
  const missingUpdateResult = await processSyncOperation({
    entity: "customer",
    entityId: "__NON_EXISTENT_CUSTOMER__",
    operation: "update",
    operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    createdAt: Date.now(),
    payload: {
      name: "Should Not Exist",
    },
  });

  if (
    missingUpdateResult.success ||
    missingUpdateResult.message !== "Entity not found."
  ) {
    throw new Error("Missing entity update was incorrectly accepted.");
  }

  console.log("Missing entity update rejection passed.");

  // DELETE
  const deleteResult = await processSyncOperation({
    entity: "customer",
    entityId: customerId,
    operation: "delete",
    operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    createdAt: Date.now(),
    payload: {},
  });

  if (!deleteResult.success) {
    throw new Error(
      `Delete synchronization failed: ${deleteResult.message}`,
    );
  }

  const deleted = await CustomerModel.findOne({
    id: customerId,
  });

  if (deleted) {
    throw new Error("Customer was not deleted from MongoDB.");
  }

  console.log("Delete synchronization passed.");

  // DELETE AGAIN — should remain successful/idempotent.
  const duplicateDeleteResult = await processSyncOperation({
    entity: "customer",
    entityId: customerId,
    operation: "delete",
    operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    createdAt: Date.now(),
    payload: {},
  });

  if (!duplicateDeleteResult.success) {
    throw new Error(
      `Duplicate delete failed: ${duplicateDeleteResult.message}`,
    );
  }

  console.log("Idempotent delete synchronization passed.");

  // UNSUPPORTED ENTITY
  const unsupportedResult = await processSyncOperation({
    entity: "__unsupported_entity__",
    entityId: "test",
    operation: "create",
    operationId: "op_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    createdAt: Date.now(),
    payload: {},
  });

  if (
    unsupportedResult.success ||
    unsupportedResult.message !==
      "Unsupported sync entity: __unsupported_entity__"
  ) {
    throw new Error(
      "Unsupported sync entity was incorrectly accepted.",
    );
  }

  console.log("Unsupported sync entity rejection passed.");

  await disconnectDatabase();

  console.log("Sync operation test passed.");
}

main().catch(async (error) => {
  console.error("Sync operation test failed.");
  console.error(error instanceof Error ? error.message : error);

  try {
    await disconnectDatabase();
  } catch {}

  process.exit(1);
});

