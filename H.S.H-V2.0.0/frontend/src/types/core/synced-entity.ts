import type { BaseEntity } from "./entity";
import type { SyncMetadata } from "../sync/sync";

export type SyncedEntity = BaseEntity & SyncMetadata;
