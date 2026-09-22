import { generateId } from "../lib/id";
import { workerRepository } from "../repositories/worker.repository";
import type { Worker } from "../types/entities/worker";
import { BaseService } from "./base.service";

export class WorkerService extends BaseService {
  async create(input: {
    name: string;
    phone: string;
    address?: string;
    birthDate?: number;
    employmentDate: number;
    position: string;
    notes?: string;
    startingSalary: number;
    monthlySalary: number;
  }): Promise<Worker> {
    const existing = await workerRepository.getByName(input.name);

    if (existing) {
      throw new Error("A worker with this name already exists.");
    }

    if (input.startingSalary < 0 || input.monthlySalary < 0) {
      throw new Error("Worker salary cannot be negative.");
    }

    const now = Date.now();

    const worker: Worker = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: input.name,
      phone: input.phone,
      address: input.address,
      birthDate: input.birthDate,
      employmentDate: input.employmentDate,
      position: input.position,
      notes: input.notes,
      startingSalary: input.startingSalary,
      monthlySalary: input.monthlySalary,
      status: "active",
      balance: input.startingSalary,
    };

    await workerRepository.create(worker);

    return worker;
  }

  async getById(id: string): Promise<Worker | undefined> {
    this.assertValidId(id, "Worker");
    return workerRepository.getById(id);
  }

  async getAll(): Promise<Worker[]> {
    return workerRepository.getAll();
  }
}

export const workerService = new WorkerService();
