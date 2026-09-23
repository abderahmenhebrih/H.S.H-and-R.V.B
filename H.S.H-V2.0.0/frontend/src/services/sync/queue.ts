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
  // Find pending for same key - MUST NEVER modify in_flight operations
  const all = await db.syncOperations.toArray();
  // Pending excludes terminal and in_flight - in_flight is immutable
  const pendingForKey = all
    .filter((o) => o.entity === entity && o.entityId === entityId && !o.synced && (o as any).status !== "terminal" && (o as any).status !== "in_flight")
    .sort((a, b) => a.createdAt - b.createdAt);
  const inFlightForKey = all.filter((o) => o.entity === entity && o.entityId === entityId && (o as any).status === "in_flight");
  const successorParentId = inFlightForKey.length > 0 ? inFlightForKey[0].operationId : undefined;

  if (pendingForKey.length === 0) {
    // No pending to coalesce, just add
    // If in_flight exists for same key, mark successor relationship explicitly
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
      ...(successorParentId ? { dependsOnOperationId: successorParentId, parentOperationId: successorParentId } : {}),
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
        ...(successorParentId ? { dependsOnOperationId: successorParentId, parentOperationId: successorParentId } : {}),
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
      // If in_flight CREATE exists, pendingForKey does not include it, so this path only deletes pending successors, not in_flight.
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
        ...(successorParentId ? { dependsOnOperationId: successorParentId, parentOperationId: successorParentId } : {}),
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
        ...(successorParentId ? { dependsOnOperationId: successorParentId, parentOperationId: successorParentId } : {}),
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
    ...(successorParentId ? { dependsOnOperationId: successorParentId, parentOperationId: successorParentId } : {}),
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
    .filter((op) => !op.synced && (op as any).status !== "terminal" && (op as any).status !== "in_flight")
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function getInFlightOperations(): Promise<SyncOperation[]> {
  const all = await db.syncOperations.toArray();
  return all.filter((op) => (op as any).status === "in_flight").sort((a, b) => a.createdAt - b.createdAt);
}

export async function transitionPendingToInFlight(operations: SyncOperation[]): Promise<SyncOperation[]> {
  if (operations.length === 0) return [];
  const ids = operations.map((o) => o.id!).filter(Boolean);
  const operationIds = operations.map((o) => o.operationId);
  // Atomically transition pending -> in_flight only for exact ids that are still pending
  await db.transaction("rw", db.syncOperations, async () => {
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (op.id === undefined) continue;
      const current: any = await db.syncOperations.get(op.id);
      if (!current) continue;
      if (current.status === "pending" || current.status === "retrying" || (!current.status && !current.synced)) {
        await db.syncOperations.update(op.id, { status: "in_flight" as any });
      }
    }
  });
  // Return immutable snapshot of in_flight ops (payload captured)
  const updated: SyncOperation[] = [];
  for (const oid of operationIds) {
    const cur = await db.syncOperations.where("operationId").equals(oid).first();
    if (cur && (cur as any).status === "in_flight") {
      updated.push({ ...cur } as SyncOperation);
    }
  }
  return updated;
}

export async function rebaseSuccessorsAfterSuccess(parentOperationId: string, newRevision: number): Promise<void> {
  const all = await db.syncOperations.toArray();
  const successors = all.filter((o: any) => (o.dependsOnOperationId === parentOperationId || o.parentOperationId === parentOperationId) && !o.synced && o.status !== "terminal" && o.status !== "in_flight");
  for (const s of successors) {
    await db.syncOperations.update(s.id!, {
      baseRevision: newRevision,
      dependsOnOperationId: undefined,
      parentOperationId: undefined,
    } as any);
  }
  // Also for any remaining pending for same entity that had no explicit depends but is pending successor (entity-local rebasing)
  // Find inFlight entity key to identify successors without explicit depends
  const parent = all.find((o: any) => o.operationId === parentOperationId);
  if (parent) {
    const siblingPending = all.filter((o: any) => o.entity === parent.entity && o.entityId === parent.entityId && !o.synced && o.status === "pending" && o.operationId !== parentOperationId);
    for (const sib of siblingPending) {
      const hasDepends = (sib as any).dependsOnOperationId || (sib as any).parentOperationId;
      if (!hasDepends) {
        await db.syncOperations.update(sib.id!, { baseRevision: newRevision } as any);
      }
    }
  }
}

export async function revertInFlightToPending(operationId: string, error?: string, retrying = true): Promise<void> {
  const op = await db.syncOperations.where("operationId").equals(operationId).first();
  if (!op || (op as any).status !== "in_flight") return;
  await db.syncOperations.update(op.id!, {
    status: retrying ? "retrying" as any : "pending" as any,
    lastError: error,
    attempts: (op.attempts ?? 0) + 1,
  } as any);
  // Keep successors pending with original baseRevision — order preserved (parent before successor due to createdAt)
  // Successors will be requeued after parent succeeds
}

export async function revertInFlightToTerminalAndRebaseSuccessors(operationId: string, error: string, currentRevision: number): Promise<void> {
  const op = await db.syncOperations.where("operationId").equals(operationId).first();
  if (!op) return;
  // Mark parent as terminal then delete after reconciliation? For now mark terminal
  await db.syncOperations.update(op.id!, { status: "terminal" as any, lastError: error, attempts: (op.attempts ?? 0) + 1 } as any);
  // Rebase successors to canonical revision so they represent intent against current server state
  const all = await db.syncOperations.toArray();
  const successors = all.filter((o: any) => (o.dependsOnOperationId === operationId || o.parentOperationId === operationId || (o.entity === op.entity && o.entityId === op.entityId)) && o.id !== op.id && !o.synced && o.status !== "in_flight");
  for (const s of successors) {
    // For normal entity updates: rebase against canonical. For business transactions: keep but rebase (do not delete)
    // Spec says never silently delete successor. So we keep and rebase.
    await db.syncOperations.update(s.id!, {
      baseRevision: currentRevision,
      dependsOnOperationId: undefined,
      parentOperationId: undefined,
      lastError: `parent terminal ${error}; rebased`,
    } as any);
  }
}

export async function recoverAbandonedInFlightOperations(): Promise<number> {
  const all = await db.syncOperations.toArray();
  const abandoned = all.filter((op: any) => !op.synced && op.status === "in_flight");
  if (abandoned.length === 0) return 0;
  // Must run inside exclusive lock - caller ensures cross-tab ownership
  await db.transaction("rw", db.syncOperations, async () => {
    for (const op of abandoned) {
      const cur: any = await db.syncOperations.get(op.id!);
      if (!cur || cur.status !== "in_flight" || cur.synced) continue;
      // Preserve all identity/payload fields, transition to retryable without new operationId
      await db.syncOperations.update(cur.id!, {
        status: "retrying" as any,
        lastError: cur.lastError ? `${cur.lastError} | recovered abandoned in_flight` : "recovered abandoned in_flight",
        // do not increment attempts here; next attempt will count
        // keep dependsOn/parent, baseRevision, payload, createdAt, operationId
      } as any);
    }
  });
  return abandoned.length;
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
