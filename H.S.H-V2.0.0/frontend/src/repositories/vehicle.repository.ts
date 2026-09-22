import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Vehicle } from "../types/entities/vehicle";

export class VehicleRepository extends BaseRepository<Vehicle> {
  constructor() {
    super(db.vehicles, "vehicle");
  }

  async getByName(name: string): Promise<Vehicle | undefined> {
    return this.table.where("name").equals(name).first();
  }

  async getByRegistrationNumber(
    registrationNumber: string,
  ): Promise<Vehicle | undefined> {
    return this.table
      .where("registrationNumber")
      .equals(registrationNumber)
      .first();
  }
}

export const vehicleRepository = new VehicleRepository();

