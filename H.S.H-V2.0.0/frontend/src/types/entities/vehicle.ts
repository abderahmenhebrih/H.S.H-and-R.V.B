import type { SyncedEntity } from "../core/synced-entity";

export interface Vehicle extends SyncedEntity {
  name: string;
  registrationNumber: string;
  image?: string;
  imageName?: string;
  type: string;
  notes?: string;
}
