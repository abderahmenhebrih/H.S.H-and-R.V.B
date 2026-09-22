import { db } from "../../lib/database/db";
import { vehicleRepository } from "../../repositories/vehicle.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class VehicleEditOperation {
  async edit(input: {
    vehicleId: string;
    name: string;
    registrationNumber: string;
    image?: string;
    imageName?: string;
    type: string;
    notes?: string;
  }) {
    return runDatabaseTransaction(async () => {
      if (!input.name.trim()) {
        throw new Error("Vehicle name is required.");
      }

      if (!input.registrationNumber.trim()) {
        throw new Error("Vehicle registration number is required.");
      }

      if (!input.type.trim()) {
        throw new Error("Vehicle type is required.");
      }

      const vehicle = await vehicleRepository.getById(input.vehicleId);

      if (!vehicle) {
        throw new Error("Vehicle not found.");
      }

      const existingName = await vehicleRepository.getByName(input.name);

      if (existingName && existingName.id !== input.vehicleId) {
        throw new Error("A vehicle with this name already exists.");
      }

      const existingRegistration =
        await vehicleRepository.getByRegistrationNumber(
          input.registrationNumber,
        );

      if (
        existingRegistration &&
        existingRegistration.id !== input.vehicleId
      ) {
        throw new Error(
          "A vehicle with this registration number already exists.",
        );
      }

      await vehicleRepository.update(input.vehicleId, {
        name: input.name,
        registrationNumber: input.registrationNumber,
        image: input.image,
        imageName: input.imageName,
        type: input.type,
        notes: input.notes,
        updatedAt: Date.now(),
        syncStatus: "pending",
      });

      return db.vehicles.get(input.vehicleId);
    });
  }
}

export const vehicleEditOperation = new VehicleEditOperation();
