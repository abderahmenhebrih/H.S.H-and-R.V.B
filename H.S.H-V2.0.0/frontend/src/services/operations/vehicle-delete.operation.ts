import { vehicleRepository } from "../../repositories/vehicle.repository";
import { runDatabaseTransaction } from "./database-transaction";

export class VehicleDeleteOperation {
  async delete(vehicleId: string) {
    return runDatabaseTransaction(async () => {
      const vehicle = await vehicleRepository.getById(vehicleId);

      if (!vehicle) {
        throw new Error("Vehicle not found.");
      }

      await vehicleRepository.delete(vehicleId);
    });
  }
}

export const vehicleDeleteOperation =
  new VehicleDeleteOperation();
