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

function mergePayloads(oldPayload: unknown, newPayload: unknown): unknown {
  if (!oldPayload || typeof oldPayload !== "object") return newPayload;
  if (!newPayload || typeof newPayload !== "object") return newPayload;
  return { ...(oldPayload as any), ...(newPayload as any) };
}

export async function coalescePendingOperations(
  entity: string,
  entityId: string,
  newOperation: SyncOperation["operation"],
  newPayload: unknown,
  opts: { baseRevision?: number; clientId?: string; operationId?: string; createdAt?: number } = {},
): Promise<number | null> {
  const now = opts.createdAt ?? Date.now();
  const operationId = opts.operationId ?? generateId();
  const clientId = opts.clientId ?? (await getOrCreateClientId());
  const baseRevision = opts.baseRevision ?? (await getServerRevision());
  // Find pending for same key
  const all = await db.syncOperations.toArray();
  const pendingForKey = all
    .filter((o) => o.entity === entity && o.entityId === entityId && !o.synced && (o as any).status !== "terminal")
    .sort((a, b) => a.createdAt - b.createdAt);

  if (pendingForKey.length === 0) {
    // No pending to coalesce, just add
    return db.syncOperations.add({
      operationId,
      entity,
      entityId,
      operation: newOperation as any,
      payload: newPayload,
      createdAt: now,
      synced: false,
      attempts: 0,
      baseRevision,
      clientId,
      status: "pending",
    } as any);
  }

  const hasCreate = pendingForKey.some((o) => o.operation === "create");
  const hasDelete = pendingForKey.some((o) => o.operation === "delete");
  const first = pendingForKey[0];

  if (newOperation === "update") {
    if (hasDelete) {
      // Delete already pending — update after delete: treat as new operation (don't coalesce into delete)
      return db.syncOperations.add({
        operationId,
        entity,
        entityId,
        operation: newOperation as any,
        payload: newPayload,
        createdAt: now,
        synced: false,
        attempts: 0,
        baseRevision,
        clientId,
        status: "pending",
      } as any);
    }
    if (hasCreate) {
      // CREATE+UPDATE → CREATE merged
      const createOp = pendingForKey.find((o) => o.operation === "create")!;
      // Merge all pending payloads after create plus newPayload into createOp
      let merged: any = { ...(createOp.payload as any) };
      for (const op of pendingForKey) {
        if (op.id === createOp.id) continue;
        merged = { ...merged, ...(op.payload as any) };
      }
      merged = { ...merged, ...(newPayload as any) };
      if (entityId) merged.id = entityId;
      await db.syncOperations.update(createOp.id!, { payload: merged, createdAt: now });
      const toDelete = pendingForKey.filter((o) => o.id !== createOp.id).map((o) => o.id!);
      if (toDelete.length) await db.syncOperations.bulkDelete(toDelete);
      return createOp.id!;
    } else {
      // UPDATE+UPDATE → UPDATE merged with original baseRevision retained
      let merged: any = { ...(first.payload as any) };
      for (let i = 1; i < pendingForKey.length; i++) {
        merged = { ...merged, ...(pendingForKey[i].payload as any) };
      }
      merged = { ...merged, ...(newPayload as any) };
      if (entityId) merged.id = entityId;
      await db.syncOperations.update(first.id!, { payload: merged, createdAt: now, baseRevision: first.baseRevision });
      const extra = pendingForKey.slice(1).map((o) => o.id!);
      if (extra.length) await db.syncOperations.bulkDelete(extra);
      return first.id!;
    }
  } else if (newOperation === "delete") {
    if (hasDelete) {
      // Already have pending delete for same key — keep original delete, ignore duplicate
      return first.id!;
    }
    if (hasCreate) {
      // CREATE+DELETE → cancel both (delete pending creates)
      const allIds = pendingForKey.map((o) => o.id!);
      await db.syncOperations.bulkDelete(allIds);
      return null;
    } else {
      // UPDATE+DELETE → DELETE with original baseRevision
      const originalBaseRevision = first.baseRevision ?? baseRevision;
      const allIds = pendingForKey.map((o) => o.id!);
      await db.syncOperations.bulkDelete(allIds);
      const newId = await db.syncOperations.add({
        operationId,
        entity,
        entityId,
        operation: "delete",
        payload: (newPayload as any) ?? { id: entityId },
        createdAt: now,
        synced: false,
        attempts: 0,
        baseRevision: originalBaseRevision,
        clientId,
        status: "pending",
      } as any);
      return newId;
    }
  } else if (newOperation === "create") {
    if (hasDelete) {
      // Delete pending then create same id -> treat as new create (re-create)
      return db.syncOperations.add({
        operationId,
        entity,
        entityId,
        operation: newOperation as any,
        payload: newPayload,
        createdAt: now,
        synced: false,
        attempts: 0,
        baseRevision,
        clientId,
        status: "pending",
      } as any);
    }
    // CREATE+CREATE unlikely but handle as merge into CREATE
    if (hasCreate) {
      const createOp = pendingForKey.find((o) => o.operation === "create")!;
      let merged: any = { ...(createOp.payload as any) };
      for (const op of pendingForKey) {
        if (op.id === createOp.id) continue;
        merged = { ...merged, ...(op.payload as any) };
      }
      merged = { ...merged, ...(newPayload as any) };
      if (entityId) merged.id = entityId;
      await db.syncOperations.update(createOp.id!, { payload: merged, createdAt: now });
      const toDelete = pendingForKey.filter((o) => o.id !== createOp.id).map((o) => o.id!);
      if (toDelete.length) await db.syncOperations.bulkDelete(toDelete);
      return createOp.id!;
    }
  }
  // Fallback: no coalescing rule matched, add as new
  return db.syncOperations.add({
    operationId,
    entity,
    entityId,
    operation: newOperation as any,
    payload: newPayload,
    createdAt: now,
    synced: false,
    attempts: 0,
    baseRevision,
    clientId,
    status: "pending",
  } as any);
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
  const now = Date.now();
  // Check if inside Dexie transaction — if so, use coalescing without starting new transaction
  const Dexie = (await import("dexie")).default as any;
  const inTx = Dexie.currentTransaction;
  if (inTx) {
    const res = await coalescePendingOperations(operation.entity, operation.entityId, operation.operation as any, operation.payload, {
      baseRevision,
      clientId,
      operationId,
      createdAt: now,
    });
    return res ?? -1;
  }
  // Otherwise transactional
  return db.transaction("rw", db.syncOperations, db.syncMeta, async () => {
    const res = await coalescePendingOperations(operation.entity, operation.entityId, operation.operation as any, operation.payload, {
      baseRevision,
      clientId,
      operationId,
      createdAt: now,
    });
    return res ?? -1;
  });
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
