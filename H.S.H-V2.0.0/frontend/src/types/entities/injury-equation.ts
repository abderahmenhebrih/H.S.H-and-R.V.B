import type { SyncedEntity } from "../core/synced-entity";

export interface InjuryEquation extends SyncedEntity {
  productId: string;
  name: string;
  inputVariable: "A";
  outputVariable: "B";
  equation: string;
  enabled: boolean;
}
