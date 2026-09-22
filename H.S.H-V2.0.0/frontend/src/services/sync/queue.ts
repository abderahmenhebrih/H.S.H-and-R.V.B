import { db, type SyncOperation } from "@/src/lib/database/db";
import { generateId } from "@/src/lib/id";
import { setupSyncHooks } from "@/src/lib/database/sync-hooks";

try {
  setupSyncHooks();
} catch {}

export async function getOrCreateClientId(): Promise<string> {
  const existing = await db.syncMeta.get("clientId");
  if (existing?.value && typeof existing.value === "string") {
    return existing.value as string;
  }
  const id = generateId();
  await db.syncMeta.put({ key: "clientId", value: id });
  return id;
}

export async function getServerRevision(): Promise<number> {
  const rec = await db.syncMeta.get("serverRevision");
  if (typeof rec?.value === "number") return rec.value as number;
  return 0;
}

export async function setServerRevision(revision: number): Promise<void> {
  await db.syncMeta.put({ key: "serverRevision", value: revision });
}

export async function getLastSuccessfulSyncAt(): Promise<number | undefined> {
  const rec = await db.syncMeta.get("lastSuccessfulSyncAt");
  if (typeof rec?.value === "number") return rec.value as number;
  return undefined;
}

export async function setLastSuccessfulSyncAt(ts: number): Promise<void> {
  await db.syncMeta.put({ key: "lastSuccessfulSyncAt", value: ts });
}

export async function queueSyncOperation(
  operation: Omit<SyncOperation, "id" | "createdAt" | "synced" | "attempts" | "operationId" | "status"> & {
    operationId?: string;
    baseRevision?: number;
    status?: SyncOperation["status"];
  },
): Promise<number> {
  const operationId = operation.operationId ?? generateId();
  const clientId = await getOrCreateClientId();
  const baseRevision = operation.baseRevision ?? (await getServerRevision());
  return db.syncOperations.add({
    operationId,
    entity: operation.entity,
    entityId: operation.entityId,
    operation: operation.operation as any,
    payload: operation.payload,
    createdAt: Date.now(),
    synced: false,
    attempts: 0,
    baseRevision,
    clientId,
    status: (operation as any).status ?? "pending",
  } as SyncOperation);
}

export async function getPendingSyncOperations(): Promise<SyncOperation[]> {
  const operations = await db.syncOperations.toArray();
  return operations
    .filter((op) => !op.synced && (op as any).status !== "terminal")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getTerminalOperations(): Promise<SyncOperation[]> {
  const all = await db.syncOperations.toArray();
  return all.filter((op) => (op as any).status === "terminal");
}

export async function markSyncOperationAsSyncedById(id: number): Promise<void> {
  await db.syncOperations.update(id, { synced: true, lastError: undefined });
}

export async function markSyncOperationAsSyncedByOperationId(
  operationId: string,
): Promise<void> {
  const op = await db.syncOperations
    .where("operationId")
    .equals(operationId)
    .first();
  if (op?.id !== undefined) {
    await db.syncOperations.update(op.id, { synced: true, lastError: undefined });
  }
}

export async function markSyncOperationAsSynced(id: number): Promise<void> {
  return markSyncOperationAsSyncedById(id);
}

export async function incrementAttemptsAndSetError(
  id: number,
  error: string,
  terminal = false,
): Promise<void> {
  const op = await db.syncOperations.get(id);
  if (!op) return;
  await db.syncOperations.update(id, {
    attempts: (op.attempts ?? 0) + 1,
    lastError: error,
    status: terminal ? "terminal" : "pending",
    synced: terminal ? false : false,
  } as any);
}

export async function markTerminal(id: number, error: string): Promise<void> {
  await incrementAttemptsAndSetError(id, error, true);
}

export async function deleteSyncedOperations(): Promise<void> {
  await db.syncOperations.where("synced").equals(1 as any).delete();
  // Dexie boolean handling - fallback
  const all = await db.syncOperations.toArray();
  const syncedIds = all.filter((o) => o.synced).map((o) => o.id!);
  if (syncedIds.length) await db.syncOperations.bulkDelete(syncedIds);
}

export async function pruneOldSyncedOperations(keepLast = 100): Promise<void> {
  const allSynced = (await db.syncOperations.toArray())
    .filter((o) => o.synced)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (allSynced.length > keepLast) {
    const toDelete = allSynced.slice(keepLast).map((o) => o.id!);
    await db.syncOperations.bulkDelete(toDelete);
  }
}

export async function getPendingSyncCount(): Promise<number> {
  return db.syncOperations.where("synced").equals(0 as any).count().catch(async () => {
    const all = await db.syncOperations.toArray();
    return all.filter((o) => !o.synced).length;
  });
}
