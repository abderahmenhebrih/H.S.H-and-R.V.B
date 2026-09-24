import { generateId } from "../lib/id";
import { taskRepository } from "../repositories/task.repository";
import type { Task } from "../types/entities/task";
import { BaseService } from "./base.service";

export class TaskService extends BaseService {
  private isUnfinished(task: Task): boolean {
    return (task.status ?? "pending") !== "completed";
  }

  private async checkDuplicateUnfinished(trimmedName: string, excludeId?: string): Promise<void> {
    const all = await taskRepository.getAll();
    const duplicate = all.find((t) => {
      if (excludeId && t.id === excludeId) return false;
      if (!this.isUnfinished(t)) return false;
      return t.name.trim() === trimmedName;
    });
    if (duplicate) {
      throw new Error("A pending task with this name already exists.");
    }
  }

  async create(input: { name: string; deadline: number }): Promise<Task> {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error("Task name is required.");
    if (!Number.isFinite(input.deadline)) throw new Error("Task deadline must be a valid finite timestamp.");

    await this.checkDuplicateUnfinished(trimmed);

    const now = Date.now();

    const task: Task = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: trimmed,
      deadline: input.deadline,
      status: "pending",
    };

    await taskRepository.create(task);

    return task;
  }

  async update(
    id: string,
    updates: Partial<Pick<Task, "name" | "deadline" | "status" | "completedAt">>,
  ): Promise<Task> {
    this.assertValidId(id, "Task");
    const existing = await taskRepository.getById(id);
    if (!existing) throw new Error("Task not found.");

    const nextName = updates.name !== undefined ? updates.name.trim() : existing.name.trim();
    if (updates.name !== undefined && !nextName) throw new Error("Task name is required.");
    if (updates.deadline !== undefined && !Number.isFinite(updates.deadline)) throw new Error("Task deadline must be a valid finite timestamp.");

    const nextStatus = updates.status !== undefined ? updates.status : (existing.status ?? "pending");
    const willBeUnfinished = nextStatus !== "completed";

    if (willBeUnfinished) {
      const isNameChange = updates.name !== undefined && nextName !== existing.name.trim();
      const isBecomingUnfinished = !this.isUnfinished(existing) && willBeUnfinished;
      const shouldCheck = isNameChange || isBecomingUnfinished || updates.name !== undefined;
      // If updating to unfinished, check duplicate excluding self. For deadline-only updates without name change, also check to ensure no existing duplicate already (should already be enforced, but safe)
      if (shouldCheck) {
        await this.checkDuplicateUnfinished(nextName, id);
      } else if (!isNameChange && this.isUnfinished(existing)) {
        // Deadline-only update on unfinished task: still need to ensure name not du duplicate with another (should already be unique, but check for safety if DB had pre-existing duplicates)
        // We skip to allow existing duplicates to remain without blocking deadline edits, but we still need to prevent new duplicates
        // So we don't check here to avoid blocking legitimate deadline edits on a task that is part of existing duplicate pair
      }
    }

    const now = Date.now();
    const toSave: Partial<Task> = {
      ...updates,
      ...(updates.name !== undefined ? { name: nextName } : {}),
      updatedAt: now,
      syncStatus: "pending",
    };

    await taskRepository.update(id, toSave);

    const updated = await taskRepository.getById(id);
    if (!updated) throw new Error("Task not found after update.");
    return updated;
  }

  async complete(id: string): Promise<Task> {
    return this.update(id, { status: "completed" as const, completedAt: Date.now() });
  }

  async reschedule(id: string, newDeadline: number): Promise<Task> {
    if (!Number.isFinite(newDeadline)) throw new Error("Task deadline must be a valid finite timestamp.");
    const existing = await taskRepository.getById(id);
    if (!existing) throw new Error("Task not found.");
    const trimmedName = existing.name.trim();
    // Rescheduling makes it pending again — must check duplicate before making it pending
    await this.checkDuplicateUnfinished(trimmedName, id);
    return this.update(id, { deadline: newDeadline, status: "pending" as const });
  }

  async getById(id: string): Promise<Task | undefined> {
    this.assertValidId(id, "Task");
    return taskRepository.getById(id);
  }

  async getAll(): Promise<Task[]> {
    return taskRepository.getAll();
  }

  async getByDeadlineRange(from: number, to: number): Promise<Task[]> {
    return taskRepository.getByDeadlineRange(from, to);
  }
}

export const taskService = new TaskService();
