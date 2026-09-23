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
    const trimmedName = input.name.trim();
    const normalizedPlate = input.registrationNumber.trim().toUpperCase();
    if (!trimmedName) throw new Error("Vehicle name is required.");
    if (!normalizedPlate) throw new Error("Registration number is required.");
    const all = await vehicleRepository.getAll();
    const nameDup = all.find((v) => v.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (nameDup) throw new Error("A vehicle with this name already exists.");
    const plateDup = all.find((v) => v.registrationNumber.trim().toUpperCase() === normalizedPlate);
    if (plateDup) throw new Error("A vehicle with this registration number already exists.");

    const now = Date.now();

    const vehicle: Vehicle = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: trimmedName,
      registrationNumber: normalizedPlate,
      image: input.image,
      imageName: input.imageName,
      type: input.type,
      notes: input.notes?.trim() || undefined,
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
