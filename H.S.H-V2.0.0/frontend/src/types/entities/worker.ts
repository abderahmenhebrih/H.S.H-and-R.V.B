import type { SyncedEntity } from "../core/synced-entity";

export type WorkerStatus = "active" | "archived";

export interface Worker extends SyncedEntity {
  name: string;
  phone: string;
  address?: string;
  birthDate?: number;
  employmentDate: number;
  position: string;
  notes?: string;
  startingSalary: number;
  monthlySalary: number;
  status: WorkerStatus;
  balance: number;
}
