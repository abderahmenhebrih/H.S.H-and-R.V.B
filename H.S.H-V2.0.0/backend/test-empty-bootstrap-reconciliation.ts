import "fake-indexeddb/auto";
import { db } from "../frontend/src/lib/database/db";
import { applySnapshot } from "../frontend/src/services/sync/apply";
import { getServerRevision, queueSyncOperation } from "../frontend/src/services/sync/queue";

async function main() {
  console.log("Empty bootstrap reconciliation test");

  await db.delete();
  await db.open();

  // Setup local IndexedDB with Customer X and Vehicle Y, no pending ops
  const now = Date.now();
  const customerId = `__TEST_CUSTOMER_X_${now}__`;
  const vehicleId = `__TEST_VEHICLE_Y_${now}__`;

  await db.customers.put({
    id: customerId,
    name: "Customer X",
    phone: "0000000000",
    type: "regular",
    balance: 1000,
    createdAt: now,
    updatedAt: now,
    syncStatus: "synced",
    serverRevision: 10,
  } as any);

  await db.vehicles.put({
    id: vehicleId,
    name: "Vehicle Y",
    registrationNumber: "REG123",
    type: "truck",
    createdAt: now,
    updatedAt: now,
    syncStatus: "synced",
    serverRevision: 10,
  } as any);

  await db.notifications.put({
    id: `__TEST_NOTIF_${now}__`,
    type: "system",
    severity: "info",
    title: "Test",
    message: "Test notif",
    createdAt: now,
    updatedAt: now,
    syncStatus: "synced",
    serverRevision: 10,
  } as any);

  console.log("Local setup: customer, vehicle, notification inserted");

  // Ensure no pending ops
  let pending = await db.syncOperations.toArray();
  if (pending.length !== 0) throw new Error(`Expected 0 pending, got ${pending.length}`);

  // Mongo bootstrap empty
  const emptySnapshot: Record<string, any[]> = {
    product: [],
    supplier: [],
    customer: [],
    bankAccount: [],
    vehicle: [],
    worker: [],
    expense: [],
    task: [],
    purchase: [],
    sale: [],
    payment: [],
    transfer: [],
    injuryEquation: [],
    settings: [],
    notification: [],
  };
  const currentRevision = 150;

  await applySnapshot(emptySnapshot, currentRevision);

  // Expect Customer X and Vehicle Y removed
  const customer = await db.customers.get(customerId);
  const vehicle = await db.vehicles.get(vehicleId);
  const notif = await db.notifications.where("id").equals(`__TEST_NOTIF_${now}__`).first().catch(() => null);
  // Actually check via get
  const notif2 = await db.notifications.get(`__TEST_NOTIF_${now}__`);

  if (customer) throw new Error("Customer X should have been removed on empty bootstrap");
  if (vehicle) throw new Error("Vehicle Y should have been removed on empty bootstrap");
  if (notif2) throw new Error("Notification should have been removed on empty bootstrap");

  const rev = await getServerRevision();
  if (rev !== 150) throw new Error(`Expected serverRevision 150, got ${rev}`);

  pending = await db.syncOperations.toArray();
  if (pending.length !== 0) throw new Error(`Expected 0 outbound ops after empty bootstrap, got ${pending.length}`);

  console.log("Empty bootstrap without pending: stale removal passed");

  // Second scenario: Customer X has pending operation, should be preserved
  await db.delete();
  await db.open();

  const customerId2 = `__TEST_CUSTOMER_PENDING_${Date.now()}__`;
  await db.customers.put({
    id: customerId2,
    name: "Customer Pending",
    phone: "1111111111",
    type: "regular",
    balance: 2000,
    createdAt: now,
    updatedAt: now,
    syncStatus: "pending",
    serverRevision: 10,
  } as any);

  // Create pending operation for this customer
  await queueSyncOperation({
    entity: "customer",
    entityId: customerId2,
    operation: "update",
    payload: { id: customerId2, name: "Customer Pending Updated" },
  });

  pending = await db.syncOperations.toArray();
  if (pending.length !== 1) throw new Error("Should have 1 pending for customer");

  await applySnapshot(emptySnapshot, 200);

  const preserved = await db.customers.get(customerId2);
  if (!preserved) throw new Error("Customer with pending should be preserved on empty bootstrap");

  const rev2 = await getServerRevision();
  if (rev2 !== 200) throw new Error(`Expected rev 200, got ${rev2}`);

  // No new outbound ops generated
  pending = await db.syncOperations.toArray();
  if (pending.length !== 1) throw new Error(`Expected 1 pending preserved, got ${pending.length}`);

  console.log("Empty bootstrap with pending: preservation passed");

  // Cleanup
  await db.delete();
  db.close();
  console.log("Empty bootstrap reconciliation test PASSED");
}

main().catch((e) => {
  console.error("Empty bootstrap test FAILED", e);
  process.exit(1);
});

