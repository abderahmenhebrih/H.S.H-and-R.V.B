import { BaseRepository } from "./base.repository";
import { db } from "../lib/database/db";
import type { Task } from "../types/entities/task";

export class TaskRepository extends BaseRepository<Task> {
  constructor() {
    super(db.tasks, "task");
  }

  async getByDeadlineRange(
    from: number,
    to: number,
  ): Promise<Task[]> {
    return this.table
      .where("deadline")
      .between(from, to, true, true)
      .toArray();
  }
}

export const taskRepository = new TaskRepository();

