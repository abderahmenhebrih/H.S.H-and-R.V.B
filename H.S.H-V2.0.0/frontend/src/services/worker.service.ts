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
    const trimmedName = input.name?.trim();
    if (!trimmedName) {
      throw new Error("Worker name is required.");
    }
    const trimmedPhone = input.phone?.trim();
    if (!trimmedPhone) {
      throw new Error("Worker phone is required.");
    }
    // Preserve raw value (+, spaces, dashes allowed) — do not strip silently
    if (!/^\+?[0-9\s\-]+$/.test(trimmedPhone)) {
      throw new Error("Invalid phone number. Phone may contain +, digits, spaces and dashes only.");
    }
    const trimmedPosition = input.position?.trim();
    if (!trimmedPosition) {
      throw new Error("Worker position is required.");
    }
    // startingSalary = initial worker balance at creation (opening balance).
    // It MAY be negative (worker enters owing money), zero, or positive.
    // Must still be a finite number — reject NaN / Infinity / -Infinity.
    if (!Number.isFinite(input.startingSalary) || Number.isNaN(input.startingSalary)) {
      throw new Error("Worker starting salary must be a valid number.");
    }
    if (!Number.isFinite(input.monthlySalary) || Number.isNaN(input.monthlySalary)) {
      throw new Error("Worker monthly salary must be a valid number.");
    }
    // Monthly salary policy preserved: zero or positive only, never negative.
    if (input.monthlySalary < 0) {
      throw new Error("Worker monthly salary cannot be negative.");
    }

    const existing = await workerRepository.getByName(trimmedName);

    if (existing) {
      throw new Error("A worker with this name already exists.");
    }

    const now = Date.now();

    const worker: Worker = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: trimmedName,
      phone: trimmedPhone,
      address: input.address?.trim() || undefined,
      birthDate: input.birthDate,
      employmentDate: input.employmentDate,
      position: trimmedPosition,
      notes: input.notes?.trim() || undefined,
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
