import { generateId } from "../lib/id";
import { taskRepository } from "../repositories/task.repository";
import type { Task } from "../types/entities/task";
import { BaseService } from "./base.service";

export class TaskService extends BaseService {
  async create(input: {
    name: string;
    deadline: number;
  }): Promise<Task> {
    if (!input.name.trim()) throw new Error("Task name is required.");
    if (!Number.isFinite(input.deadline)) throw new Error("Task deadline must be a valid finite timestamp.");

    const now = Date.now();

    const task: Task = {
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      syncStatus: "pending",
      name: input.name.trim(),
      deadline: input.deadline,
      status: "pending",
    };

    await taskRepository.create(task);

    return task;
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
