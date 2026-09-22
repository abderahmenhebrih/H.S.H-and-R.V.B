import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { vehicleService } from "../frontend/src/services/vehicle.service";
import { vehicleDeleteOperation } from "../frontend/src/services/operations/vehicle-delete.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const vehicle = await vehicleService.create({
    name: `__TEST_VEHICLE_DELETE_${now}__`,
    registrationNumber: `REG-DELETE-${now}`,
    type: "truck",
    image: "test-image",
    notes: "Test vehicle",
  });

  await vehicleDeleteOperation.delete(vehicle.id);

  const deleted = await db.vehicles.get(vehicle.id);

  if (deleted) {
    throw new Error("Vehicle was not deleted.");
  }

  console.log("Vehicle deletion passed.");

  try {
    await vehicleDeleteOperation.delete(
      "__NON_EXISTENT_VEHICLE__",
    );

    throw new Error("Missing vehicle was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Vehicle not found."
    ) {
      console.log("Missing vehicle rejection passed.");
    } else {
      throw error;
    }
  }

  const protectedTestVehicle = await vehicleService.create({
    name: `__TEST_VEHICLE_DELETE_PROTECTED_${now}__`,
    registrationNumber: `REG-PROTECTED-${now}`,
    type: "van",
  });

  const beforeFailure = await db.vehicles.get(
    protectedTestVehicle.id,
  );

  if (!beforeFailure) {
    throw new Error("Vehicle disappeared before protection test.");
  }

  try {
    await vehicleDeleteOperation.delete(
      "__NON_EXISTENT_VEHICLE__",
    );

    throw new Error("Invalid vehicle deletion was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Vehicle not found."
    ) {
      console.log("Vehicle failed-delete rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailure = await db.vehicles.get(
    protectedTestVehicle.id,
  );

  if (
    !afterFailure ||
    afterFailure.name !== beforeFailure.name ||
    afterFailure.registrationNumber !==
      beforeFailure.registrationNumber ||
    afterFailure.type !== beforeFailure.type
  ) {
    throw new Error("Failed vehicle deletion affected another vehicle.");
  }

  console.log("Vehicle delete protection passed.");
  console.log("Vehicle delete operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Vehicle delete operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

