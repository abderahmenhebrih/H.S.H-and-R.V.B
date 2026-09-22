import { SyncCounterModel } from "../models/sync-counter.model";
import { SyncChangeModel } from "../models/sync-change.model";

/**
 * Allocate next global server revision inside a transaction/session.
 * Mirrors logic in sync-service.ts#getNextRevision
 */
export async function allocateRevision(session: any): Promise<number> {
  const doc = await SyncCounterModel.findOneAndUpdate(
    { name: "global" },
    { $inc: { revision: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true, session },
  );
  if (!doc) {
    const created = await SyncCounterModel.create([{ name: "global", revision: 1 }], { session } as any);
    return (created[0] as any).revision as number;
  }
  if (typeof (doc as any).revision !== "number") {
    await SyncCounterModel.updateOne({ name: "global" }, { $set: { revision: 1 } }, { session } as any);
    return 1;
  }
  return (doc as any).revision as number;
}

/**
 * Create a SyncChange entry for a synchronized business entity.
 * Must be called inside the same MongoDB session/transaction as the business mutation.
 * Assigns serverRevision to payload and persists change.
 */
export async function recordSyncChange(
  session: any,
  params: {
    entity: string;
    entityId: string;
    operation: "create" | "update" | "delete";
    payload: any;
    operationId?: string;
    sourceClientId?: string;
  },
): Promise<number> {
  const revision = await allocateRevision(session);
  // Assign serverRevision to payload for consistency (payload is the canonical entity snapshot)
  if (params.payload && typeof params.payload === "object") {
    params.payload.serverRevision = revision;
    params.payload.syncStatus = "synced";
    params.payload.lastSyncedAt = Date.now();
  }
  await SyncChangeModel.create(
    [
      {
        revision,
        entity: params.entity,
        entityId: params.entityId,
        operation: params.operation,
        payload: params.payload,
        changedAt: new Date(),
        sourceClientId: params.sourceClientId || "rvb-server",
        operationId: params.operationId || `rvb-${params.entity}-${params.entityId}-${revision}`,
      },
    ],
    { session },
  );
  return revision;
}
