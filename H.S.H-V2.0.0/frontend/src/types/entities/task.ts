import type { SyncedEntity } from "../core/synced-entity";

export interface Task extends SyncedEntity {
  name: string;
  deadline: number;
  status?: "pending" | "completed";
  completedAt?: number;
}
