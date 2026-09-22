import { generateId } from "../lib/id";
import { vehicleRepository } from "../repositories/vehicle.repository";
import type { Vehicle } from "../types/entities/vehicle";
import { BaseService } from "./base.service";

export class VehicleService extends BaseService {
  async create(input: {
    name: string;
    registrationNumber: string;
    image?: string;
    imageName?: string;
    type: string;
    notes?: string;
  }): Promise<Vehicle> {
    const existingName = await vehicleRepository.getByName(input.name);

    if (existingName) {
      throw new Error("A vehicle with this name already exists.");
    }

    const existingRegistration =
      await vehicleRepository.getByRegistrationNumber(
        input.registrationNumber,
      );

    if (existingRegistration) {
      throw new Error(
        "A vehicle with this registration number already exists.",
      );
    }

    const now = Date.now();

    const vehicle: Vehicle = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: input.name,
      registrationNumber: input.registrationNumber,
      image: input.image,
      imageName: input.imageName,
      type: input.type,
      notes: input.notes,
    };

    await vehicleRepository.create(vehicle);

    return vehicle;
  }

  async getById(id: string): Promise<Vehicle | undefined> {
    this.assertValidId(id, "Vehicle");
    return vehicleRepository.getById(id);
  }

  async getAll(): Promise<Vehicle[]> {
    return vehicleRepository.getAll();
  }
}

export const vehicleService = new VehicleService();
