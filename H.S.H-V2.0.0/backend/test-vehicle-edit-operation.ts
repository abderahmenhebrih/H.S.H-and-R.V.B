import "fake-indexeddb/auto";

import { db } from "../frontend/src/lib/database/db";
import { vehicleService } from "../frontend/src/services/vehicle.service";
import { vehicleEditOperation } from "../frontend/src/services/operations/vehicle-edit.operation";

async function main() {
  await db.delete();
  await db.open();

  const now = Date.now();

  const vehicle = await vehicleService.create({
    name: `__TEST_VEHICLE_EDIT_${now}__`,
    registrationNumber: `REG-${now}`,
    image: "original-image",
    type: "truck",
    notes: "Original notes",
  });

  const secondVehicle = await vehicleService.create({
    name: `__TEST_VEHICLE_EDIT_OTHER_${now}__`,
    registrationNumber: `REG-OTHER-${now}`,
    type: "van",
  });

  await vehicleEditOperation.edit({
    vehicleId: vehicle.id,
    name: `__TEST_VEHICLE_EDITED_${now}__`,
    registrationNumber: `REG-EDITED-${now}`,
    image: "edited-image",
    type: "refrigerated-truck",
    notes: "Edited notes",
  });

  let updated = await db.vehicles.get(vehicle.id);

  if (
    !updated ||
    updated.name !== `__TEST_VEHICLE_EDITED_${now}__` ||
    updated.registrationNumber !== `REG-EDITED-${now}` ||
    updated.image !== "edited-image" ||
    updated.type !== "refrigerated-truck" ||
    updated.notes !== "Edited notes"
  ) {
    throw new Error("Vehicle edit persistence failed.");
  }

  console.log("Vehicle edit persistence passed.");

  await vehicleEditOperation.edit({
    vehicleId: vehicle.id,
    name: updated.name,
    registrationNumber: `REG-CHANGED-${now}`,
    image: "second-image",
    type: "van",
    notes: "Second edit",
  });

  updated = await db.vehicles.get(vehicle.id);

  if (
    !updated ||
    updated.registrationNumber !== `REG-CHANGED-${now}` ||
    updated.image !== "second-image" ||
    updated.type !== "van" ||
    updated.notes !== "Second edit"
  ) {
    throw new Error("Vehicle field edit failed.");
  }

  console.log("Vehicle field edit passed.");

  try {
    await vehicleEditOperation.edit({
      vehicleId: vehicle.id,
      name: secondVehicle.name,
      registrationNumber: updated.registrationNumber,
      type: updated.type,
    });

    throw new Error("Duplicate vehicle name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A vehicle with this name already exists."
    ) {
      console.log("Duplicate vehicle name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await vehicleEditOperation.edit({
      vehicleId: vehicle.id,
      name: updated.name,
      registrationNumber: secondVehicle.registrationNumber,
      type: updated.type,
    });

    throw new Error("Duplicate vehicle registration was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "A vehicle with this registration number already exists."
    ) {
      console.log("Duplicate vehicle registration rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await vehicleEditOperation.edit({
      vehicleId: vehicle.id,
      name: "",
      registrationNumber: "SHOULD-FAIL",
      type: "van",
    });

    throw new Error("Empty vehicle name was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Vehicle name is required."
    ) {
      console.log("Empty vehicle name rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await vehicleEditOperation.edit({
      vehicleId: vehicle.id,
      name: updated.name,
      registrationNumber: "",
      type: "van",
    });

    throw new Error("Empty vehicle registration number was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Vehicle registration number is required."
    ) {
      console.log("Empty registration rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await vehicleEditOperation.edit({
      vehicleId: vehicle.id,
      name: updated.name,
      registrationNumber: updated.registrationNumber,
      type: "",
    });

    throw new Error("Empty vehicle type was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Vehicle type is required."
    ) {
      console.log("Empty vehicle type rejection passed.");
    } else {
      throw error;
    }
  }

  try {
    await vehicleEditOperation.edit({
      vehicleId: "__NON_EXISTENT_VEHICLE__",
      name: "Should fail",
      registrationNumber: "SHOULD-FAIL",
      type: "van",
    });

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

  const beforeFailure = await db.vehicles.get(vehicle.id);

  if (!beforeFailure) {
    throw new Error("Vehicle disappeared before rollback test.");
  }

  try {
    await vehicleEditOperation.edit({
      vehicleId: vehicle.id,
      name: "",
      registrationNumber: "SHOULD-FAIL",
      type: "van",
    });

    throw new Error("Invalid vehicle edit was accepted.");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Vehicle name is required."
    ) {
      console.log("Vehicle failed-edit rejection passed.");
    } else {
      throw error;
    }
  }

  const afterFailure = await db.vehicles.get(vehicle.id);

  if (
    !afterFailure ||
    afterFailure.name !== beforeFailure.name ||
    afterFailure.registrationNumber !==
      beforeFailure.registrationNumber ||
    afterFailure.image !== beforeFailure.image ||
    afterFailure.type !== beforeFailure.type ||
    afterFailure.notes !== beforeFailure.notes
  ) {
    throw new Error("Failed vehicle edit was not atomic.");
  }

  console.log("Vehicle edit rollback passed.");
  console.log("Vehicle edit operation test passed.");

  db.close();
}

main().catch((error) => {
  console.error("Vehicle edit operation test failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

