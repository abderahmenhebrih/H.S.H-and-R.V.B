# PBS-BUG-008 Audit

## Target
PBS-BUG-008 — per-terminal full bootstrap reconciliation

## Primary Source File
H.S.H-V2.0.0/frontend/src/services/sync/client.ts

## Related Files
H.S.H-V2.0.0/frontend/src/services/sync/queue.ts
H.S.H-V2.0.0/frontend/src/services/sync/apply.ts

## BEFORE — client.ts

```ts
import {
  getPendingSyncOperations,
  getReadyPendingSyncOperations,
  markSyncOperationAsSyncedByOperationId,
  getOrCreateClientId,
  deleteSyncedOperations,
  getServerRevision,
  transitionPendingToInFlight,
  rebaseSuccessorsAfterSuccess,
  revertInFlightToPending,
  revertInFlightToTerminalAndRebaseSuccessors,
} from "./queue";
import { db } from "@/src/lib/database/db";
import { getTableForSyncEntity } from "./tables";

interface SyncOperationResult {
  operationId: string;
  entity: string;
  entityId: string;
  operation: "create" | "update" | "delete" | "upsert";
  success: boolean;
  message: string;
  revision?: number;
  canonicalEntity?: unknown;
  conflict?: boolean;
  error?: string;
  retryable?: boolean;
}

interface SyncResponse {
  success: boolean;
  results: SyncOperationResult[];
  currentRevision?: number;
}

export interface SyncChange {
  revision: number;
  entity: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload?: unknown;
  changedAt: string | Date;
  sourceClientId?: string;
  operationId?: string;
}

export interface SyncChangesResponse {
  changes: SyncChange[];
  nextRevision: number;
  hasMore: boolean;
  currentRevision: number;
}

const BATCH_SIZE = 100;

export async function syncPendingOperations(): Promise<SyncResponse> {
  const clientId = await getOrCreateClientId();
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const allResults: SyncOperationResult[] = [];
  let overallSuccess = true;
  const MAX_DRAIN_ITERATIONS = 1000;
  let drainIterations = 0;
  while (drainIterations < MAX_DRAIN_ITERATIONS) {
    drainIterations++;
    const ready = await getReadyPendingSyncOperations();
    if (ready.length === 0) {
      if (allResults.length === 0) return { success: true, results: [] };
      break;
    }
    const batchSlice = ready.slice(0, BATCH_SIZE);
    // P0: atomically transition ready -> in_flight to capture immutable batch, dependency-aware
    const batch = await transitionPendingToInFlight(batchSlice);
    if (batch.length === 0) {
      // No progress — all ready were blocked by dependencies after query
      const stillReady = await getReadyPendingSyncOperations();
      if (stillReady.length === 0) break;
      break;
    }
    // Build immutable payload from transitioned batch
    const payload = {
      clientId,
      operations: batch.map((op) => ({
        operationId: (op as any).operationId ?? String(op.id),
        entity: op.entity,
        entityId: op.entityId,
        operation: op.operation,
        payload: op.payload,
        createdAt: op.createdAt,
        baseRevision: (op as any).baseRevision,
        clientId: (op as any).clientId ?? clientId,
      })),
    };
    let response: Response;
    try {
      response = await fetch(`${apiBase}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Network/transient failure: revert in_flight -> retryable without destroying successors
      for (const op of batch) {
        try { await revertInFlightToPending((op as any).operationId, error instanceof Error ? error.message : String(error), true); } catch {}
      }
      throw new Error(error instanceof Error ? `Sync request failed: ${error.message}` : "Sync request failed.");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // Treat HTTP error as transient for in_flight revert
      for (const op of batch) {
        try { await revertInFlightToPending((op as any).operationId, `HTTP ${response.status}: ${text}`, true); } catch {}
      }
      throw new Error(`Sync request failed with status ${response.status}: ${text}`);
    }
    const result = (await response.json()) as SyncResponse;
    for (const r of result.results) {
      allResults.push(r);
      if (!r.success) {
        overallSuccess = false;
        const match = batch.find((b) => ((b as any).operationId ?? String(b.id)) === r.operationId);
        const isTerminal = (r as any).retryable === false;
        // Locate in_flight operationId (batch already in_flight)
        const operationId = r.operationId;
        if (isTerminal) {
          // Terminal: reconcile canonical, rebase successors, keep successors
          try {
            const { getServerRevision: getRev } = await import("./queue");
            // For retryable false, need to transition in_flight to terminal and rebase successors
            const currentRev = await getRev().catch(()=>0);
            // Use dedicated terminal+rebase helper
            await revertInFlightToTerminalAndRebaseSuccessors(operationId, r.error ?? r.message, currentRev);
          } catch {}
          // NOTE (PBS-BUG-007): do NOT call incrementAttemptsAndSetError here — the
          // helper above already marks terminal, sets lastError, and increments
          // attempts exactly once. A second call would double-count attempts.
        } else {
          // Retryable true -> revert in_flight to retrying (immutable), preserve successor
          // Do NOT call incrementAttemptsAndSetError first: it would set pending and break retrying distinction
          try { await revertInFlightToPending(operationId, r.error ?? r.message, true); } catch {}
        }
        // Log conflict if present
        if (r.conflict) {
          try {
            await db.syncConflicts.add({
              entity: r.entity,
              entityId: r.entityId,
              operationId: r.operationId,
              baseRevision: (match as any)?.baseRevision,
              serverRevision: r.revision ?? 0,
              detectedAt: Date.now(),
              resolution: "server-last-write-wins",
              details: r,
            });
          } catch {}
        }
        // P0: Rejected reconciliation — extend to UPDATE/DELETE with snapshot preservation
        const businessEntities = new Set(["sale","purchase","payment","transfer"]);
        const isBusiness = businessEntities.has(r.entity);
        const isTerminalBusiness = isTerminal && isBusiness;
        const isTerminalUpdateDelete = isTerminal && (r.operation === "update" || r.operation === "delete" || (r as any).operation === "upsert");
        // Terminal CREATE for any entity (especially business) — remove ghost; for business also restore canonical via snapshot.
        // Terminal UPDATE/DELETE for any entity or business — optimistic local remains wrong, must fetch canonical snapshot and apply without deleting unrelated pending locals.
        if (isTerminal && (isTerminalBusiness || isTerminalUpdateDelete || r.operation === "create")) {
          try {
            if (r.operation === "create") {
              // Remove optimistic ghost doc (business saleB etc and also generic product/customer ghosts)
              const table = getTableForEntity(r.entity);
              if (table) {
                const { runAsRemote } = await import("@/src/lib/database/sync-hooks");
                await runAsRemote(async () => {
                  try { await (table as any).delete(r.entityId); } catch {}
                });
              }
            }
            // For business terminal (any op) or any terminal update/delete, fetch canonical snapshot and apply preserving pending locals.
            const shouldFetchSnapshot = isTerminalBusiness || isTerminalUpdateDelete;
            if (shouldFetchSnapshot) {
              try {
                const bootstrap = await fetchBootstrap();
                const { applySnapshot } = await import("./apply");
                await applySnapshot(bootstrap.snapshot, bootstrap.currentRevision);
              } catch (reconcileErr) {
                console.warn(`[sync] reconcile after terminal ${r.entity} ${r.operation} failed`, reconcileErr);
              }
            }
            // Delete terminal sync operation so it doesn't remain as ghost pending (after snapshot applied)
            // But for in_flight we already marked terminal via helper, ensure deleted if needed after reconciliation
            const opInFlight = await db.syncOperations.where("operationId").equals(operationId).first().catch(()=>null);
            if (opInFlight?.id !== undefined) {
              try { await db.syncOperations.delete(opInFlight.id); } catch {}
            } else if (match?.id !== undefined) {
              try { await db.syncOperations.delete(match.id); } catch {}
            }
          } catch {}
        } else if (isTerminal && isBusiness) {
          // Fallback delete terminal business op if not covered above
          try {
            const opInFlight2 = await db.syncOperations.where("operationId").equals(operationId).first().catch(()=>null);
            if (opInFlight2?.id !== undefined) { try { await db.syncOperations.delete(opInFlight2.id); } catch {} }
            else if (match?.id !== undefined) {
              try { await db.syncOperations.delete(match.id); } catch {}
            }
          } catch {}
        }
        continue;
      }
      // Success: handle in_flight success with successor rebase (P0)
      const operationId = r.operationId;
      const match = batch.find((b) => ((b as any).operationId ?? String(b.id)) === operationId);
      if (match) {
        // Update local entity syncStatus to synced if still exists
        try {
          const table = getTableForEntity(r.entity);
          if (table) {
            const existing: any = await (table as any).get(r.entityId);
            if (existing) {
              await (table as any).update(r.entityId, {
                syncStatus: "synced",
                lastSyncedAt: Date.now(),
                serverRevision: r.revision,
              });
            }
          }
        } catch {}
        // Rebase pending successors before deleting parent to preserve intent at new revision
        if (r.revision !== undefined) {
          try { await rebaseSuccessorsAfterSuccess(operationId, r.revision); } catch {}
        }
        // Delete the in_flight operation (consume)
        try {
          const opToDelete = await db.syncOperations.where("operationId").equals(operationId).first();
          if (opToDelete?.id !== undefined) await db.syncOperations.delete(opToDelete.id);
          else if (match.id !== undefined) await db.syncOperations.delete(match.id);
        } catch {}
        if (r.conflict) {
          try {
            await db.syncConflicts.add({
              entity: r.entity,
              entityId: r.entityId,
              operationId: r.operationId,
              baseRevision: (match as any)?.baseRevision,
              serverRevision: r.revision ?? 0,
              detectedAt: Date.now(),
              resolution: "server-last-write-wins",
              details: r,
            });
          } catch {}
        }
      } else {
        // Batch mismatch? still try to clean in_flight by operationId
        try {
          const opToDelete = await db.syncOperations.where("operationId").equals(operationId).first();
          if (opToDelete?.id !== undefined) {
            if (r.revision !== undefined) try { await rebaseSuccessorsAfterSuccess(operationId, r.revision); } catch {}
            await db.syncOperations.delete(opToDelete.id);
          }
        } catch {}
      }
    }
    // Apply canonical entity without queuing (must use remote context)
    for (const r of result.results) {
      if (r.success && r.canonicalEntity && typeof r.canonicalEntity === "object") {
        try {
          const { runAsRemote } = await import("@/src/lib/database/sync-hooks");
          const table = getTableForEntity(r.entity);
          if (table) {
            const canon: any = r.canonicalEntity;
            canon.syncStatus = "synced";
            canon.lastSyncedAt = Date.now();
            if (r.revision) canon.serverRevision = r.revision;
            await runAsRemote(async () => {
              await (table as any).put(canon);
            });
          }
        } catch {}
      }
    }
  }

  // Prune old synced if any remain (should be deleted already)
  try {
    await deleteSyncedOperations();
  } catch {}

  return { success: overallSuccess, results: allResults };
}

function getTableForEntity(entity: string): any {
  return getTableForSyncEntity(entity);
}

export async function fetchRemoteChanges(after: number, limit = 200): Promise<SyncChangesResponse> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const url = `${apiBase}/api/sync/changes?after=${after}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch changes failed ${res.status}`);
  return (await res.json()) as SyncChangesResponse;
}

export interface BootstrapSnapshot {
  snapshot: Record<string, any[]>;
  currentRevision: number;
}

export async function fetchBootstrap(): Promise<BootstrapSnapshot> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const res = await fetch(`${apiBase}/api/sync/bootstrap`);
  if (!res.ok) throw new Error(`Bootstrap failed ${res.status}`);
  const data = await res.json();
  // Support both legacy {changes, currentRevision} and new {snapshot, currentRevision}
  if (data.snapshot) return data as BootstrapSnapshot;
  // Legacy fallback: convert changes to snapshot
  if (Array.isArray(data.changes)) {
    const snap: Record<string, any[]> = {};
    for (const ch of data.changes) {
      if (!snap[ch.entity]) snap[ch.entity] = [];
      if (ch.operation !== "delete" && ch.payload) snap[ch.entity].push(ch.payload);
    }
    return { snapshot: snap, currentRevision: data.currentRevision ?? 0 };
  }
  return { snapshot: {}, currentRevision: data.currentRevision ?? 0 };
}

export async function fetchCurrentRevision(): Promise<number> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  try {
    const res = await fetch(`${apiBase}/api/sync/status`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.currentRevision ?? 0;
  } catch {
    return 0;
  }
}
```

## BEFORE — queue.ts

```ts
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
  // Find pending for same key - MUST NEVER modify in_flight OR retrying operations (both immutable after first send)
  const all = await db.syncOperations.toArray();
  // Pending mutable: only status pending (or legacy unset) is coalescable; retrying/in_flight/terminal are immutable
  const pendingForKey = all
    .filter((o) => {
      if (o.entity !== entity || o.entityId !== entityId || o.synced) return false;
      const s = (o as any).status;
      if (s === "terminal" || s === "in_flight" || s === "retrying") return false;
      // allow legacy undefined/null as pending
      return s === "pending" || !s;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
  const immutableParentForKey = all
    .filter((o) => o.entity === entity && o.entityId === entityId && ((o as any).status === "in_flight" || (o as any).status === "retrying"))
    .sort((a, b) => b.createdAt - a.createdAt);
  const successorParentId = immutableParentForKey.length > 0 ? immutableParentForKey[0].operationId : undefined;

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

export async function getReadyPendingSyncOperations(): Promise<SyncOperation[]> {
  const all = await db.syncOperations.toArray();
  const activeIds = new Set<string>(
    all
      .filter((op: any) => !op.synced && op.status !== "terminal")
      .map((op) => op.operationId),
  );
  return all
    .filter((op: any) => {
      if (op.synced) return false;
      if (op.status === "terminal" || op.status === "in_flight") return false;
      // allow legacy unset status as pending/retrying
      const dep = (op as any).dependsOnOperationId as string | undefined;
      const parent = (op as any).parentOperationId as string | undefined;
      if (dep && activeIds.has(dep)) return false;
      if (parent && activeIds.has(parent)) return false;
      return true;
    })
    .sort((a: any, b: any) => a.createdAt - b.createdAt);
}

export async function getInFlightOperations(): Promise<SyncOperation[]> {
  const all = await db.syncOperations.toArray();
  return all.filter((op) => (op as any).status === "in_flight").sort((a, b) => a.createdAt - b.createdAt);
}

export async function transitionPendingToInFlight(operations: SyncOperation[]): Promise<SyncOperation[]> {
  if (operations.length === 0) return [];
  const operationIds = operations.map((o) => o.operationId);
  const resultIds: string[] = [];
  await db.transaction("rw", db.syncOperations, async () => {
    // Build active set inside transaction for dependency check
    const allInside: any[] = await db.syncOperations.toArray();
    const activeIdsInside = new Set<string>(
      allInside.filter((op: any) => !op.synced && op.status !== "terminal").map((op: any) => op.operationId),
    );
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (op.id === undefined) continue;
      const current: any = await db.syncOperations.get(op.id);
      if (!current) continue;
      const isPendingLike =
        current.status === "pending" || current.status === "retrying" || (!current.status && !current.synced);
      if (!isPendingLike) continue;
      const dep = (current as any).dependsOnOperationId as string | undefined;
      const parent = (current as any).parentOperationId as string | undefined;
      const depActive = dep ? activeIdsInside.has(dep) : false;
      const parentActive = parent ? activeIdsInside.has(parent) : false;
      // Also check if dependency is the same operation (should not happen) but guard
      // For the input batch, if parent is also in this batch, the active set still contains it, so child will be blocked
      // That's desired: parent and child must not be in same request
      if (depActive || parentActive) {
        // Leave child pending — do not transition
        continue;
      }
      await db.syncOperations.update(op.id, { status: "in_flight" as any });
      resultIds.push(current.operationId);
    }
  });
  // Return immutable snapshot of only successfully transitioned ops
  const updated: SyncOperation[] = [];
  for (const oid of resultIds) {
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
  // NOTE: do not query the boolean `synced` index with .equals() — booleans are
  // not valid IndexedDB keys (equals(1) matches nothing, equals(true) throws
  // DataError). Filter in JS like the other helpers in this file.
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
  // NOTE: do not query the boolean `synced` index with .equals() — booleans are
  // not valid IndexedDB keys (equals(0) matches nothing, equals(false) throws
  // DataError). Filter in JS like the other helpers in this file.
  const all = await db.syncOperations.toArray();
  return all.filter((o) => !o.synced).length;
}
```

## BEFORE — apply.ts

```ts
import { db } from "@/src/lib/database/db";
import { setServerRevision, getServerRevision } from "./queue";
import { runAsRemote } from "@/src/lib/database/sync-hooks";
import { getAllSyncTables, getTableForSyncEntity, SYNC_ENTITIES } from "./tables";

export interface SyncChange {
  revision: number;
  entity: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload?: unknown;
  changedAt?: string | Date;
  sourceClientId?: string;
  operationId?: string;
}

function getTable(entity: string): any {
  return getTableForSyncEntity(entity);
}

export async function applyRemoteChange(change: SyncChange): Promise<void> {
  const table = getTable(change.entity);
  if (!table) {
    console.warn(`[sync] unknown entity ${change.entity} for revision ${change.revision}`);
    return;
  }
  const id = change.entityId;
  if (change.operation === "delete") {
    await runAsRemote(async () => {
      await table.delete(id);
    });
    return;
  }
  const payload: any = change.payload;
  if (!payload || typeof payload !== "object") {
    console.warn(`[sync] missing payload for ${change.entity} ${id} rev ${change.revision}`);
    return;
  }
  const toStore = {
    ...payload,
    id,
    syncStatus: "synced",
    lastSyncedAt: Date.now(),
    serverRevision: change.revision,
  };
  await runAsRemote(async () => {
    await table.put(toStore);
  });
}

function emitDbSyncEvent(changes: SyncChange[]) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("hebrih-db-synced", { detail: { changes } }));
  } catch {}
}

async function hasPendingOperation(entity: string, entityId: string): Promise<boolean> {
  const all = await db.syncOperations.toArray();
  return all.some((o) => o.entity === entity && o.entityId === entityId && !o.synced && (o as any).status !== "terminal");
}

export async function applyRemoteChanges(changes: SyncChange[]): Promise<void> {
  if (changes.length === 0) return;
  // Ensure sorted by revision
  const sorted = [...changes].sort((a, b) => a.revision - b.revision);
  const maxRevision = sorted[sorted.length - 1].revision;
  const currentBefore = await getServerRevision();
  // Filter out already applied? The caller ensures after cursor, but double-check
  const toApply = sorted.filter((c) => c.revision > currentBefore);
  if (toApply.length === 0) return;

  const syncTables = getAllSyncTables();
  // Deduplicate to avoid Dexie duplicate-table error when combining with meta tables
  const remoteTables = [...new Set([...syncTables, db.syncMeta])];
  await runAsRemote(async () => {
    await db.transaction(
      "rw",
      remoteTables,
      async () => {
        for (const change of toApply) {
          // Direct table ops without going through applyRemoteChange's runAsRemote (already in remote context)
          const table = getTable(change.entity);
          if (!table) continue;
          if (change.operation === "delete") {
            await table.delete(change.entityId);
          } else {
            const payload: any = change.payload;
            if (!payload || typeof payload !== "object") continue;
            const toStore = {
              ...payload,
              id: change.entityId,
              syncStatus: "synced",
              lastSyncedAt: Date.now(),
              serverRevision: change.revision,
            };
            await table.put(toStore);
          }
        }
        await setServerRevision(maxRevision);
        await db.syncMeta.put({ key: "lastSuccessfulSyncAt", value: Date.now() });
      },
    );
  });
  emitDbSyncEvent(toApply);
  // Desktop toast for new remote notifications (not bootstrap)
  try {
    const { notificationService } = await import("../notification.service");
    const { settingsService } = await import("../settings.service");
    const settings: any = await settingsService.get().catch(() => null);
    if (settings?.notifications?.desktopEnabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      for (const ch of toApply) {
        if (ch.entity === "notification" && ch.operation === "create" && ch.payload) {
          const n: any = ch.payload;
          if (n.readAt) continue;
          // Only toast for important types
          const important = ["customer_order", "task", "inventory", "sync", "system"];
          if (!important.includes(n.type)) continue;
          try {
            new Notification(n.title, { body: n.message });
          } catch {}
        }
      }
    }
  } catch {}
}

function collectBusinessAffectedKeys(op: any, localEntity: any | null): Set<string> {
  const keys = new Set<string>();
  const entity = op.entity as string;
  const payload: any = op.payload || {};
  try {
    if (entity === "sale") {
      // For sale, protect sale id itself already in pendingSet, but also customer and products
      const customerIds = new Set<string>();
      const productIds = new Set<string>();
      // Payload new
      if (payload.customerId) customerIds.add(String(payload.customerId));
      if (Array.isArray(payload.items)) for (const it of payload.items) if (it?.productId) productIds.add(String(it.productId));
      // Local existing (old) for update/delete
      if (localEntity) {
        if (localEntity.customerId) customerIds.add(String(localEntity.customerId));
        if (Array.isArray(localEntity.items)) for (const it of localEntity.items) if (it?.productId) productIds.add(String(it.productId));
      }
      for (const cid of customerIds) keys.add(`customer:${cid}`);
      for (const pid of productIds) keys.add(`product:${pid}`);
      keys.add(`sale:${op.entityId}`);
    } else if (entity === "purchase") {
      const supplierIds = new Set<string>();
      const productIds = new Set<string>();
      if (payload.supplierId) supplierIds.add(String(payload.supplierId));
      if (Array.isArray(payload.items)) for (const it of payload.items) if (it?.productId) productIds.add(String(it.productId));
      if (localEntity) {
        if (localEntity.supplierId) supplierIds.add(String(localEntity.supplierId));
        if (Array.isArray(localEntity.items)) for (const it of localEntity.items) if (it?.productId) productIds.add(String(it.productId));
      }
      for (const sid of supplierIds) keys.add(`supplier:${sid}`);
      for (const pid of productIds) keys.add(`product:${pid}`);
      keys.add(`purchase:${op.entityId}`);
    } else if (entity === "payment") {
      const accountIds = new Set<string>();
      const entityKeys = new Set<string>();
      const payloadAccount = payload.accountId ? String(payload.accountId) : null;
      const payloadEntityType = payload.entityType ? String(payload.entityType) : null;
      const payloadEntityId = payload.entityId ? String(payload.entityId) : null;
      if (payloadAccount) accountIds.add(payloadAccount);
      if (payloadEntityType && payloadEntityId && ["supplier","customer","worker"].includes(payloadEntityType)) entityKeys.add(`${payloadEntityType}:${payloadEntityId}`);
      if (payloadEntityType === "expense" && payloadEntityId) {
        // expense entity itself not pending-protected? but bank still
      }
      // Old from localEntity (for update/delete payload may not contain old)
      if (localEntity) {
        if (localEntity.accountId) accountIds.add(String(localEntity.accountId));
        if (localEntity.entityType && localEntity.entityId && ["supplier","customer","worker"].includes(String(localEntity.entityType))) entityKeys.add(`${String(localEntity.entityType)}:${String(localEntity.entityId)}`);
      }
      // Also consider op.entityId is payment id itself
      keys.add(`payment:${op.entityId}`);
      for (const aid of accountIds) keys.add(`bankAccount:${aid}`);
      for (const ek of entityKeys) keys.add(ek);
    } else if (entity === "transfer") {
      const accIds = new Set<string>();
      if (payload.fromAccountId) accIds.add(String(payload.fromAccountId));
      if (payload.toAccountId) accIds.add(String(payload.toAccountId));
      if (localEntity) {
        if (localEntity.fromAccountId) accIds.add(String(localEntity.fromAccountId));
        if (localEntity.toAccountId) accIds.add(String(localEntity.toAccountId));
      }
      keys.add(`transfer:${op.entityId}`);
      for (const aid of accIds) keys.add(`bankAccount:${aid}`);
    }
  } catch {}
  return keys;
}

export async function applySnapshot(snapshot: Record<string, any[]>, currentRevision: number): Promise<void> {
  const entries = Object.entries(snapshot);
  // Empty snapshot is still canonical — must reconcile stale locals (remove non-pending records)
  // Do NOT early-return without reconciliation.
  const allChanges: SyncChange[] = [];
  for (const [entity, docs] of entries) {
    for (const doc of docs as any[]) {
      allChanges.push({
        revision: currentRevision,
        entity,
        entityId: doc.id,
        operation: "create",
        payload: doc,
      } as any);
    }
  }
  const syncTablesSnapshot = getAllSyncTables();
  const snapshotTables = [...new Set([...syncTablesSnapshot, db.syncMeta, db.syncOperations])];
  await runAsRemote(async () => {
    await db.transaction(
      "rw",
      snapshotTables,
      async () => {
        // Build pending set from syncOperations where status !== terminal and not synced (skip overwriting local pending).
        // Exception: if pending operation just rejected and was deleted, its canonical should overwrite — so terminal ops not in set.
        const allOps = await db.syncOperations.toArray();
        const pendingSet = new Set<string>(
          allOps
            .filter((o: any) => !o.synced && o.status !== "terminal")
            .map((o) => `${o.entity}:${o.entityId}`)
        );
        // Extend pendingSet with derived business keys: queueSync:false for derived entities
        // Business authoritative ops protect their affected derived records from snapshot overwrite
        const businessEntities = new Set(["sale","purchase","payment","transfer"]);
        for (const op of allOps) {
          if (!businessEntities.has(op.entity)) continue;
          if ((op as any).synced) continue;
          if ((op as any).status === "terminal") continue;
          if ((op as any).status === "in_flight") {
            // in_flight also protects derived keys (still pending optimistic)
            // Need to also protect? But in_flight will be resolved before snapshot? Keep for safety.
          }
          if (!op.entity || !op.entityId) continue;
          // Determine if this op is still pending (includes in_flight for protection)
          const isPendingLike = !(op as any).synced && (op as any).status !== "terminal";
          if (!isPendingLike) continue;
          let localEntity: any = null;
          try {
            const table = getTable(op.entity);
            if (table) localEntity = await table.get(op.entityId);
          } catch {}
          const affected = collectBusinessAffectedKeys(op, localEntity);
          for (const k of affected) pendingSet.add(k);
        }
        // Upsert server records, but preserve pending locals (do not overwrite).
        for (const [entity, docs] of entries) {
          const table = getTable(entity);
          if (!table) continue;
          for (const doc of docs as any[]) {
            const key = `${entity}:${doc.id}`;
            if (pendingSet.has(key)) {
              // Do not overwrite local pending — keeps optimistic state until pushed.
              continue;
            }
            const toStore = {
              ...doc,
              syncStatus: "synced",
              lastSyncedAt: Date.now(),
              serverRevision: currentRevision,
            };
            await table.put(toStore);
          }
        }
        // Reconciliation: remove stale local records not in snapshot and without pending
        for (const [entity, docs] of entries) {
          const table = getTable(entity);
          if (!table) continue;
          const serverIds = new Set((docs as any[]).map((d: any) => d.id));
          const localAll: any[] = await table.toArray();
          for (const local of localAll) {
            if (!serverIds.has(local.id)) {
              const key = `${entity}:${local.id}`;
              if (!pendingSet.has(key)) {
                await table.delete(local.id);
              }
            }
          }
        }
        // Also handle entities not in snapshot at all (e.g., if snapshot empty for some entity, all locals are stale)
        // For entities not present in snapshot keys, we consider snapshot empty -> all locals are stale unless pending
        const snapshotEntities = new Set(entries.map(([e]) => e));
        const allEntityNames = [...SYNC_ENTITIES];
        for (const ent of allEntityNames) {
          if (!snapshotEntities.has(ent)) {
            const table = getTable(ent);
            if (!table) continue;
            const localAll: any[] = await table.toArray();
            for (const local of localAll) {
              const key = `${ent}:${local.id}`;
              if (!pendingSet.has(key)) {
                await table.delete(local.id);
              }
            }
          }
        }
        await setServerRevision(currentRevision);
        await db.syncMeta.put({ key: "lastSuccessfulSyncAt", value: Date.now() });
      },
    );
  });
  emitDbSyncEvent(allChanges);
}

export async function applyBootstrapChanges(changes: SyncChange[], currentRevision: number): Promise<void> {
  if (changes.length === 0) {
    await setServerRevision(currentRevision);
    return;
  }
  await applyRemoteChanges(changes);
}
```

## AFTER — client.ts

```ts
import {
  getPendingSyncOperations,
  getReadyPendingSyncOperations,
  markSyncOperationAsSyncedByOperationId,
  getOrCreateClientId,
  deleteSyncedOperations,
  getServerRevision,
  transitionPendingToInFlight,
  rebaseSuccessorsAfterSuccess,
  revertInFlightToPending,
  revertInFlightToTerminalAndRebaseSuccessors,
} from "./queue";
import { db } from "@/src/lib/database/db";
import { getTableForSyncEntity } from "./tables";

interface SyncOperationResult {
  operationId: string;
  entity: string;
  entityId: string;
  operation: "create" | "update" | "delete" | "upsert";
  success: boolean;
  message: string;
  revision?: number;
  canonicalEntity?: unknown;
  conflict?: boolean;
  error?: string;
  retryable?: boolean;
}

interface SyncResponse {
  success: boolean;
  results: SyncOperationResult[];
  currentRevision?: number;
}

export interface SyncChange {
  revision: number;
  entity: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload?: unknown;
  changedAt: string | Date;
  sourceClientId?: string;
  operationId?: string;
}

export interface SyncChangesResponse {
  changes: SyncChange[];
  nextRevision: number;
  hasMore: boolean;
  currentRevision: number;
}

const BATCH_SIZE = 100;

export async function syncPendingOperations(): Promise<SyncResponse> {
  const clientId = await getOrCreateClientId();
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const allResults: SyncOperationResult[] = [];
  let overallSuccess = true;
  const MAX_DRAIN_ITERATIONS = 1000;
  let drainIterations = 0;
  while (drainIterations < MAX_DRAIN_ITERATIONS) {
    drainIterations++;
    const ready = await getReadyPendingSyncOperations();
    if (ready.length === 0) {
      if (allResults.length === 0) return { success: true, results: [] };
      break;
    }
    const batchSlice = ready.slice(0, BATCH_SIZE);
    // P0: atomically transition ready -> in_flight to capture immutable batch, dependency-aware
    const batch = await transitionPendingToInFlight(batchSlice);
    if (batch.length === 0) {
      // No progress — all ready were blocked by dependencies after query
      const stillReady = await getReadyPendingSyncOperations();
      if (stillReady.length === 0) break;
      break;
    }
    // Build immutable payload from transitioned batch
    const payload = {
      clientId,
      operations: batch.map((op) => ({
        operationId: (op as any).operationId ?? String(op.id),
        entity: op.entity,
        entityId: op.entityId,
        operation: op.operation,
        payload: op.payload,
        createdAt: op.createdAt,
        baseRevision: (op as any).baseRevision,
        clientId: (op as any).clientId ?? clientId,
      })),
    };
    let response: Response;
    try {
      response = await fetch(`${apiBase}/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Network/transient failure: revert in_flight -> retryable without destroying successors
      for (const op of batch) {
        try { await revertInFlightToPending((op as any).operationId, error instanceof Error ? error.message : String(error), true); } catch {}
      }
      throw new Error(error instanceof Error ? `Sync request failed: ${error.message}` : "Sync request failed.");
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      // Treat HTTP error as transient for in_flight revert
      for (const op of batch) {
        try { await revertInFlightToPending((op as any).operationId, `HTTP ${response.status}: ${text}`, true); } catch {}
      }
      throw new Error(`Sync request failed with status ${response.status}: ${text}`);
    }
    const result = (await response.json()) as SyncResponse;
    // PBS-BUG-008: batch-level terminal reconciliation state. Per-result terminal
    // bookkeeping stays inside the loop below, but the expensive authoritative
    // bootstrap/snapshot reconciliation runs exactly once per response (see below).
    let batchNeedsSnapshot = false;
    const batchTerminalOps: Array<{ operationId: string; matchId?: number }> = [];
    // PBS-BUG-008 correction: numeric Dexie row ids (not operationId) — a legacy queue
    // row may lack a usable operationId yet still be rebased by the terminal helper.
    const batchTerminalSuccessorRowIds: number[] = [];
    for (const r of result.results) {
      allResults.push(r);
      if (!r.success) {
        overallSuccess = false;
        const match = batch.find((b) => ((b as any).operationId ?? String(b.id)) === r.operationId);
        const isTerminal = (r as any).retryable === false;
        // Locate in_flight operationId (batch already in_flight)
        const operationId = r.operationId;
        if (isTerminal) {
          // Terminal: reconcile canonical, rebase successors, keep successors
          try {
            const { getServerRevision: getRev } = await import("./queue");
            // For retryable false, need to transition in_flight to terminal and rebase successors
            const currentRev = await getRev().catch(()=>0);
            // PBS-BUG-008 correction: capture successor ROW IDS before the helper runs,
            // using the helper's own successor domain exactly (queue.ts
            // revertInFlightToTerminalAndRebaseSuccessors): linked rows plus ALL
            // unsynced non-in_flight same-entity rows — no status==="pending"
            // requirement, no link-absence requirement — so the shared post-loop
            // reconciliation can rebase every helper-touched row to the authoritative
            // bootstrap revision instead of this pre-snapshot cursor.
            try {
              const queued = await db.syncOperations.toArray();
              for (const o of queued as any[]) {
                if (o.synced || o.operationId === operationId) continue;
                const st = (o as any).status;
                const linked = (o as any).dependsOnOperationId === operationId || (o as any).parentOperationId === operationId;
                const sameEntity = o.entity === r.entity && o.entityId === r.entityId;
                if ((linked || sameEntity) && !o.synced && st !== "in_flight") {
                  if (typeof o.id === "number" && !batchTerminalSuccessorRowIds.includes(o.id)) batchTerminalSuccessorRowIds.push(o.id);
                }
              }
            } catch {}
            // Use dedicated terminal+rebase helper
            await revertInFlightToTerminalAndRebaseSuccessors(operationId, r.error ?? r.message, currentRev);
          } catch {}
          // NOTE (PBS-BUG-007): do NOT call incrementAttemptsAndSetError here — the
          // helper above already marks terminal, sets lastError, and increments
          // attempts exactly once. A second call would double-count attempts.
        } else {
          // Retryable true -> revert in_flight to retrying (immutable), preserve successor
          // Do NOT call incrementAttemptsAndSetError first: it would set pending and break retrying distinction
          try { await revertInFlightToPending(operationId, r.error ?? r.message, true); } catch {}
        }
        // Log conflict if present
        if (r.conflict) {
          try {
            await db.syncConflicts.add({
              entity: r.entity,
              entityId: r.entityId,
              operationId: r.operationId,
              baseRevision: (match as any)?.baseRevision,
              serverRevision: r.revision ?? 0,
              detectedAt: Date.now(),
              resolution: "server-last-write-wins",
              details: r,
            });
          } catch {}
        }
        // P0: Rejected reconciliation — extend to UPDATE/DELETE with snapshot preservation
        const businessEntities = new Set(["sale","purchase","payment","transfer"]);
        const isBusiness = businessEntities.has(r.entity);
        const isTerminalBusiness = isTerminal && isBusiness;
        const isTerminalUpdateDelete = isTerminal && (r.operation === "update" || r.operation === "delete" || (r as any).operation === "upsert");
        // Terminal CREATE for any entity (especially business) — remove ghost; for business also restore canonical via snapshot.
        // Terminal UPDATE/DELETE for any entity or business — optimistic local remains wrong, must fetch canonical snapshot and apply without deleting unrelated pending locals.
        if (isTerminal && (isTerminalBusiness || isTerminalUpdateDelete || r.operation === "create")) {
          try {
            if (r.operation === "create") {
              // Remove optimistic ghost doc (business saleB etc and also generic product/customer ghosts)
              const table = getTableForEntity(r.entity);
              if (table) {
                const { runAsRemote } = await import("@/src/lib/database/sync-hooks");
                await runAsRemote(async () => {
                  try { await (table as any).delete(r.entityId); } catch {}
                });
              }
            }
            // For business terminal (any op) or any terminal update/delete, fetch canonical snapshot and apply preserving pending locals.
            // PBS-BUG-008: defer the authoritative bootstrap/snapshot — it runs exactly
            // once after the loop for the whole batch (see below). Terminal rows stay
            // until then; applySnapshot's pendingSet excludes terminal rows whether
            // present or deleted, so protection semantics are unchanged.
            const shouldFetchSnapshot = isTerminalBusiness || isTerminalUpdateDelete;
            if (shouldFetchSnapshot) batchNeedsSnapshot = true;
            batchTerminalOps.push({ operationId, matchId: match?.id });
          } catch {}
        } else if (isTerminal && isBusiness) {
          // Fallback delete terminal business op if not covered above
          try {
            const opInFlight2 = await db.syncOperations.where("operationId").equals(operationId).first().catch(()=>null);
            if (opInFlight2?.id !== undefined) { try { await db.syncOperations.delete(opInFlight2.id); } catch {} }
            else if (match?.id !== undefined) {
              try { await db.syncOperations.delete(match.id); } catch {}
            }
          } catch {}
        }
        continue;
      }
      // Success: handle in_flight success with successor rebase (P0)
      const operationId = r.operationId;
      const match = batch.find((b) => ((b as any).operationId ?? String(b.id)) === operationId);
      if (match) {
        // Update local entity syncStatus to synced if still exists
        try {
          const table = getTableForEntity(r.entity);
          if (table) {
            const existing: any = await (table as any).get(r.entityId);
            if (existing) {
              await (table as any).update(r.entityId, {
                syncStatus: "synced",
                lastSyncedAt: Date.now(),
                serverRevision: r.revision,
              });
            }
          }
        } catch {}
        // Rebase pending successors before deleting parent to preserve intent at new revision
        if (r.revision !== undefined) {
          try { await rebaseSuccessorsAfterSuccess(operationId, r.revision); } catch {}
        }
        // Delete the in_flight operation (consume)
        try {
          const opToDelete = await db.syncOperations.where("operationId").equals(operationId).first();
          if (opToDelete?.id !== undefined) await db.syncOperations.delete(opToDelete.id);
          else if (match.id !== undefined) await db.syncOperations.delete(match.id);
        } catch {}
        if (r.conflict) {
          try {
            await db.syncConflicts.add({
              entity: r.entity,
              entityId: r.entityId,
              operationId: r.operationId,
              baseRevision: (match as any)?.baseRevision,
              serverRevision: r.revision ?? 0,
              detectedAt: Date.now(),
              resolution: "server-last-write-wins",
              details: r,
            });
          } catch {}
        }
      } else {
        // Batch mismatch? still try to clean in_flight by operationId
        try {
          const opToDelete = await db.syncOperations.where("operationId").equals(operationId).first();
          if (opToDelete?.id !== undefined) {
            if (r.revision !== undefined) try { await rebaseSuccessorsAfterSuccess(operationId, r.revision); } catch {}
            await db.syncOperations.delete(opToDelete.id);
          }
        } catch {}
      }
    }
    // PBS-BUG-008: single shared terminal reconciliation per response (previously one
    // fetchBootstrap + applySnapshot per terminal result inside the loop above).
    let sharedBootstrapRevision: number | undefined;
    if (batchNeedsSnapshot) {
      try {
        const bootstrap = await fetchBootstrap();
        const { applySnapshot } = await import("./apply");
        await applySnapshot(bootstrap.snapshot, bootstrap.currentRevision);
        sharedBootstrapRevision = bootstrap.currentRevision;
      } catch (reconcileErr) {
        console.warn(`[sync] shared reconcile after terminal results failed`, reconcileErr);
      }
    }
    // Rebase captured successors to the authoritative post-snapshot revision. The
    // in-loop helper rebased them to the older pre-snapshot cursor, which would go
    // stale and cause avoidable conflict churn on the next push. Rows are reloaded
    // by numeric id; rows that have since become synced/terminal/in_flight are not
    // pending future pushes, so their revision is left alone.
    if (sharedBootstrapRevision !== undefined && batchTerminalSuccessorRowIds.length > 0) {
      for (const succRowId of batchTerminalSuccessorRowIds) {
        try {
          const row: any = await db.syncOperations.get(succRowId);
          if (!row || row.synced) continue;
          const st = (row as any).status;
          if (st === "terminal" || st === "in_flight") continue;
          await db.syncOperations.update(row.id!, { baseRevision: sharedBootstrapRevision } as any);
        } catch {}
      }
    }
    // Delete consumed terminal outbox rows after reconciliation (same order as before:
    // snapshot first, cleanup second; terminal rows excluded from pendingSet either way).
    for (const term of batchTerminalOps) {
      try {
        const opInFlight = await db.syncOperations.where("operationId").equals(term.operationId).first().catch(()=>null);
        if (opInFlight?.id !== undefined) {
          try { await db.syncOperations.delete(opInFlight.id); } catch {}
        } else if (term.matchId !== undefined) {
          try { await db.syncOperations.delete(term.matchId); } catch {}
        }
      } catch {}
    }
    // Apply canonical entity without queuing (must use remote context)
    for (const r of result.results) {
      if (r.success && r.canonicalEntity && typeof r.canonicalEntity === "object") {
        try {
          const { runAsRemote } = await import("@/src/lib/database/sync-hooks");
          const table = getTableForEntity(r.entity);
          if (table) {
            const canon: any = r.canonicalEntity;
            canon.syncStatus = "synced";
            canon.lastSyncedAt = Date.now();
            if (r.revision) canon.serverRevision = r.revision;
            await runAsRemote(async () => {
              await (table as any).put(canon);
            });
          }
        } catch {}
      }
    }
  }

  // Prune old synced if any remain (should be deleted already)
  try {
    await deleteSyncedOperations();
  } catch {}

  return { success: overallSuccess, results: allResults };
}

function getTableForEntity(entity: string): any {
  return getTableForSyncEntity(entity);
}

export async function fetchRemoteChanges(after: number, limit = 200): Promise<SyncChangesResponse> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const url = `${apiBase}/api/sync/changes?after=${after}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch changes failed ${res.status}`);
  return (await res.json()) as SyncChangesResponse;
}

export interface BootstrapSnapshot {
  snapshot: Record<string, any[]>;
  currentRevision: number;
}

export async function fetchBootstrap(): Promise<BootstrapSnapshot> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  const res = await fetch(`${apiBase}/api/sync/bootstrap`);
  if (!res.ok) throw new Error(`Bootstrap failed ${res.status}`);
  const data = await res.json();
  // Support both legacy {changes, currentRevision} and new {snapshot, currentRevision}
  if (data.snapshot) return data as BootstrapSnapshot;
  // Legacy fallback: convert changes to snapshot
  if (Array.isArray(data.changes)) {
    const snap: Record<string, any[]> = {};
    for (const ch of data.changes) {
      if (!snap[ch.entity]) snap[ch.entity] = [];
      if (ch.operation !== "delete" && ch.payload) snap[ch.entity].push(ch.payload);
    }
    return { snapshot: snap, currentRevision: data.currentRevision ?? 0 };
  }
  return { snapshot: {}, currentRevision: data.currentRevision ?? 0 };
}

export async function fetchCurrentRevision(): Promise<number> {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  try {
    const res = await fetch(`${apiBase}/api/sync/status`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.currentRevision ?? 0;
  } catch {
    return 0;
  }
}
```

## AFTER — queue.ts

```ts
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
  // Find pending for same key - MUST NEVER modify in_flight OR retrying operations (both immutable after first send)
  const all = await db.syncOperations.toArray();
  // Pending mutable: only status pending (or legacy unset) is coalescable; retrying/in_flight/terminal are immutable
  const pendingForKey = all
    .filter((o) => {
      if (o.entity !== entity || o.entityId !== entityId || o.synced) return false;
      const s = (o as any).status;
      if (s === "terminal" || s === "in_flight" || s === "retrying") return false;
      // allow legacy undefined/null as pending
      return s === "pending" || !s;
    })
    .sort((a, b) => a.createdAt - b.createdAt);
  const immutableParentForKey = all
    .filter((o) => o.entity === entity && o.entityId === entityId && ((o as any).status === "in_flight" || (o as any).status === "retrying"))
    .sort((a, b) => b.createdAt - a.createdAt);
  const successorParentId = immutableParentForKey.length > 0 ? immutableParentForKey[0].operationId : undefined;

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

export async function getReadyPendingSyncOperations(): Promise<SyncOperation[]> {
  const all = await db.syncOperations.toArray();
  const activeIds = new Set<string>(
    all
      .filter((op: any) => !op.synced && op.status !== "terminal")
      .map((op) => op.operationId),
  );
  return all
    .filter((op: any) => {
      if (op.synced) return false;
      if (op.status === "terminal" || op.status === "in_flight") return false;
      // allow legacy unset status as pending/retrying
      const dep = (op as any).dependsOnOperationId as string | undefined;
      const parent = (op as any).parentOperationId as string | undefined;
      if (dep && activeIds.has(dep)) return false;
      if (parent && activeIds.has(parent)) return false;
      return true;
    })
    .sort((a: any, b: any) => a.createdAt - b.createdAt);
}

export async function getInFlightOperations(): Promise<SyncOperation[]> {
  const all = await db.syncOperations.toArray();
  return all.filter((op) => (op as any).status === "in_flight").sort((a, b) => a.createdAt - b.createdAt);
}

export async function transitionPendingToInFlight(operations: SyncOperation[]): Promise<SyncOperation[]> {
  if (operations.length === 0) return [];
  const operationIds = operations.map((o) => o.operationId);
  const resultIds: string[] = [];
  await db.transaction("rw", db.syncOperations, async () => {
    // Build active set inside transaction for dependency check
    const allInside: any[] = await db.syncOperations.toArray();
    const activeIdsInside = new Set<string>(
      allInside.filter((op: any) => !op.synced && op.status !== "terminal").map((op: any) => op.operationId),
    );
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (op.id === undefined) continue;
      const current: any = await db.syncOperations.get(op.id);
      if (!current) continue;
      const isPendingLike =
        current.status === "pending" || current.status === "retrying" || (!current.status && !current.synced);
      if (!isPendingLike) continue;
      const dep = (current as any).dependsOnOperationId as string | undefined;
      const parent = (current as any).parentOperationId as string | undefined;
      const depActive = dep ? activeIdsInside.has(dep) : false;
      const parentActive = parent ? activeIdsInside.has(parent) : false;
      // Also check if dependency is the same operation (should not happen) but guard
      // For the input batch, if parent is also in this batch, the active set still contains it, so child will be blocked
      // That's desired: parent and child must not be in same request
      if (depActive || parentActive) {
        // Leave child pending — do not transition
        continue;
      }
      await db.syncOperations.update(op.id, { status: "in_flight" as any });
      resultIds.push(current.operationId);
    }
  });
  // Return immutable snapshot of only successfully transitioned ops
  const updated: SyncOperation[] = [];
  for (const oid of resultIds) {
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
  // NOTE: do not query the boolean `synced` index with .equals() — booleans are
  // not valid IndexedDB keys (equals(1) matches nothing, equals(true) throws
  // DataError). Filter in JS like the other helpers in this file.
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
  // NOTE: do not query the boolean `synced` index with .equals() — booleans are
  // not valid IndexedDB keys (equals(0) matches nothing, equals(false) throws
  // DataError). Filter in JS like the other helpers in this file.
  const all = await db.syncOperations.toArray();
  return all.filter((o) => !o.synced).length;
}
```

## AFTER — apply.ts

```ts
import { db } from "@/src/lib/database/db";
import { setServerRevision, getServerRevision } from "./queue";
import { runAsRemote } from "@/src/lib/database/sync-hooks";
import { getAllSyncTables, getTableForSyncEntity, SYNC_ENTITIES } from "./tables";

export interface SyncChange {
  revision: number;
  entity: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload?: unknown;
  changedAt?: string | Date;
  sourceClientId?: string;
  operationId?: string;
}

function getTable(entity: string): any {
  return getTableForSyncEntity(entity);
}

export async function applyRemoteChange(change: SyncChange): Promise<void> {
  const table = getTable(change.entity);
  if (!table) {
    console.warn(`[sync] unknown entity ${change.entity} for revision ${change.revision}`);
    return;
  }
  const id = change.entityId;
  if (change.operation === "delete") {
    await runAsRemote(async () => {
      await table.delete(id);
    });
    return;
  }
  const payload: any = change.payload;
  if (!payload || typeof payload !== "object") {
    console.warn(`[sync] missing payload for ${change.entity} ${id} rev ${change.revision}`);
    return;
  }
  const toStore = {
    ...payload,
    id,
    syncStatus: "synced",
    lastSyncedAt: Date.now(),
    serverRevision: change.revision,
  };
  await runAsRemote(async () => {
    await table.put(toStore);
  });
}

function emitDbSyncEvent(changes: SyncChange[]) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("hebrih-db-synced", { detail: { changes } }));
  } catch {}
}

async function hasPendingOperation(entity: string, entityId: string): Promise<boolean> {
  const all = await db.syncOperations.toArray();
  return all.some((o) => o.entity === entity && o.entityId === entityId && !o.synced && (o as any).status !== "terminal");
}

export async function applyRemoteChanges(changes: SyncChange[]): Promise<void> {
  if (changes.length === 0) return;
  // Ensure sorted by revision
  const sorted = [...changes].sort((a, b) => a.revision - b.revision);
  const maxRevision = sorted[sorted.length - 1].revision;
  const currentBefore = await getServerRevision();
  // Filter out already applied? The caller ensures after cursor, but double-check
  const toApply = sorted.filter((c) => c.revision > currentBefore);
  if (toApply.length === 0) return;

  const syncTables = getAllSyncTables();
  // Deduplicate to avoid Dexie duplicate-table error when combining with meta tables
  const remoteTables = [...new Set([...syncTables, db.syncMeta])];
  await runAsRemote(async () => {
    await db.transaction(
      "rw",
      remoteTables,
      async () => {
        for (const change of toApply) {
          // Direct table ops without going through applyRemoteChange's runAsRemote (already in remote context)
          const table = getTable(change.entity);
          if (!table) continue;
          if (change.operation === "delete") {
            await table.delete(change.entityId);
          } else {
            const payload: any = change.payload;
            if (!payload || typeof payload !== "object") continue;
            const toStore = {
              ...payload,
              id: change.entityId,
              syncStatus: "synced",
              lastSyncedAt: Date.now(),
              serverRevision: change.revision,
            };
            await table.put(toStore);
          }
        }
        await setServerRevision(maxRevision);
        await db.syncMeta.put({ key: "lastSuccessfulSyncAt", value: Date.now() });
      },
    );
  });
  emitDbSyncEvent(toApply);
  // Desktop toast for new remote notifications (not bootstrap)
  try {
    const { notificationService } = await import("../notification.service");
    const { settingsService } = await import("../settings.service");
    const settings: any = await settingsService.get().catch(() => null);
    if (settings?.notifications?.desktopEnabled && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      for (const ch of toApply) {
        if (ch.entity === "notification" && ch.operation === "create" && ch.payload) {
          const n: any = ch.payload;
          if (n.readAt) continue;
          // Only toast for important types
          const important = ["customer_order", "task", "inventory", "sync", "system"];
          if (!important.includes(n.type)) continue;
          try {
            new Notification(n.title, { body: n.message });
          } catch {}
        }
      }
    }
  } catch {}
}

function collectBusinessAffectedKeys(op: any, localEntity: any | null): Set<string> {
  const keys = new Set<string>();
  const entity = op.entity as string;
  const payload: any = op.payload || {};
  try {
    if (entity === "sale") {
      // For sale, protect sale id itself already in pendingSet, but also customer and products
      const customerIds = new Set<string>();
      const productIds = new Set<string>();
      // Payload new
      if (payload.customerId) customerIds.add(String(payload.customerId));
      if (Array.isArray(payload.items)) for (const it of payload.items) if (it?.productId) productIds.add(String(it.productId));
      // Local existing (old) for update/delete
      if (localEntity) {
        if (localEntity.customerId) customerIds.add(String(localEntity.customerId));
        if (Array.isArray(localEntity.items)) for (const it of localEntity.items) if (it?.productId) productIds.add(String(it.productId));
      }
      for (const cid of customerIds) keys.add(`customer:${cid}`);
      for (const pid of productIds) keys.add(`product:${pid}`);
      keys.add(`sale:${op.entityId}`);
    } else if (entity === "purchase") {
      const supplierIds = new Set<string>();
      const productIds = new Set<string>();
      if (payload.supplierId) supplierIds.add(String(payload.supplierId));
      if (Array.isArray(payload.items)) for (const it of payload.items) if (it?.productId) productIds.add(String(it.productId));
      if (localEntity) {
        if (localEntity.supplierId) supplierIds.add(String(localEntity.supplierId));
        if (Array.isArray(localEntity.items)) for (const it of localEntity.items) if (it?.productId) productIds.add(String(it.productId));
      }
      for (const sid of supplierIds) keys.add(`supplier:${sid}`);
      for (const pid of productIds) keys.add(`product:${pid}`);
      keys.add(`purchase:${op.entityId}`);
    } else if (entity === "payment") {
      const accountIds = new Set<string>();
      const entityKeys = new Set<string>();
      const payloadAccount = payload.accountId ? String(payload.accountId) : null;
      const payloadEntityType = payload.entityType ? String(payload.entityType) : null;
      const payloadEntityId = payload.entityId ? String(payload.entityId) : null;
      if (payloadAccount) accountIds.add(payloadAccount);
      if (payloadEntityType && payloadEntityId && ["supplier","customer","worker"].includes(payloadEntityType)) entityKeys.add(`${payloadEntityType}:${payloadEntityId}`);
      if (payloadEntityType === "expense" && payloadEntityId) {
        // expense entity itself not pending-protected? but bank still
      }
      // Old from localEntity (for update/delete payload may not contain old)
      if (localEntity) {
        if (localEntity.accountId) accountIds.add(String(localEntity.accountId));
        if (localEntity.entityType && localEntity.entityId && ["supplier","customer","worker"].includes(String(localEntity.entityType))) entityKeys.add(`${String(localEntity.entityType)}:${String(localEntity.entityId)}`);
      }
      // Also consider op.entityId is payment id itself
      keys.add(`payment:${op.entityId}`);
      for (const aid of accountIds) keys.add(`bankAccount:${aid}`);
      for (const ek of entityKeys) keys.add(ek);
    } else if (entity === "transfer") {
      const accIds = new Set<string>();
      if (payload.fromAccountId) accIds.add(String(payload.fromAccountId));
      if (payload.toAccountId) accIds.add(String(payload.toAccountId));
      if (localEntity) {
        if (localEntity.fromAccountId) accIds.add(String(localEntity.fromAccountId));
        if (localEntity.toAccountId) accIds.add(String(localEntity.toAccountId));
      }
      keys.add(`transfer:${op.entityId}`);
      for (const aid of accIds) keys.add(`bankAccount:${aid}`);
    }
  } catch {}
  return keys;
}

export async function applySnapshot(snapshot: Record<string, any[]>, currentRevision: number): Promise<void> {
  const entries = Object.entries(snapshot);
  // Empty snapshot is still canonical — must reconcile stale locals (remove non-pending records)
  // Do NOT early-return without reconciliation.
  const allChanges: SyncChange[] = [];
  for (const [entity, docs] of entries) {
    for (const doc of docs as any[]) {
      allChanges.push({
        revision: currentRevision,
        entity,
        entityId: doc.id,
        operation: "create",
        payload: doc,
      } as any);
    }
  }
  const syncTablesSnapshot = getAllSyncTables();
  const snapshotTables = [...new Set([...syncTablesSnapshot, db.syncMeta, db.syncOperations])];
  await runAsRemote(async () => {
    await db.transaction(
      "rw",
      snapshotTables,
      async () => {
        // Build pending set from syncOperations where status !== terminal and not synced (skip overwriting local pending).
        // Exception: if pending operation just rejected and was deleted, its canonical should overwrite — so terminal ops not in set.
        const allOps = await db.syncOperations.toArray();
        const pendingSet = new Set<string>(
          allOps
            .filter((o: any) => !o.synced && o.status !== "terminal")
            .map((o) => `${o.entity}:${o.entityId}`)
        );
        // Extend pendingSet with derived business keys: queueSync:false for derived entities
        // Business authoritative ops protect their affected derived records from snapshot overwrite
        const businessEntities = new Set(["sale","purchase","payment","transfer"]);
        for (const op of allOps) {
          if (!businessEntities.has(op.entity)) continue;
          if ((op as any).synced) continue;
          if ((op as any).status === "terminal") continue;
          if ((op as any).status === "in_flight") {
            // in_flight also protects derived keys (still pending optimistic)
            // Need to also protect? But in_flight will be resolved before snapshot? Keep for safety.
          }
          if (!op.entity || !op.entityId) continue;
          // Determine if this op is still pending (includes in_flight for protection)
          const isPendingLike = !(op as any).synced && (op as any).status !== "terminal";
          if (!isPendingLike) continue;
          let localEntity: any = null;
          try {
            const table = getTable(op.entity);
            if (table) localEntity = await table.get(op.entityId);
          } catch {}
          const affected = collectBusinessAffectedKeys(op, localEntity);
          for (const k of affected) pendingSet.add(k);
        }
        // Upsert server records, but preserve pending locals (do not overwrite).
        for (const [entity, docs] of entries) {
          const table = getTable(entity);
          if (!table) continue;
          for (const doc of docs as any[]) {
            const key = `${entity}:${doc.id}`;
            if (pendingSet.has(key)) {
              // Do not overwrite local pending — keeps optimistic state until pushed.
              continue;
            }
            const toStore = {
              ...doc,
              syncStatus: "synced",
              lastSyncedAt: Date.now(),
              serverRevision: currentRevision,
            };
            await table.put(toStore);
          }
        }
        // Reconciliation: remove stale local records not in snapshot and without pending
        for (const [entity, docs] of entries) {
          const table = getTable(entity);
          if (!table) continue;
          const serverIds = new Set((docs as any[]).map((d: any) => d.id));
          const localAll: any[] = await table.toArray();
          for (const local of localAll) {
            if (!serverIds.has(local.id)) {
              const key = `${entity}:${local.id}`;
              if (!pendingSet.has(key)) {
                await table.delete(local.id);
              }
            }
          }
        }
        // Also handle entities not in snapshot at all (e.g., if snapshot empty for some entity, all locals are stale)
        // For entities not present in snapshot keys, we consider snapshot empty -> all locals are stale unless pending
        const snapshotEntities = new Set(entries.map(([e]) => e));
        const allEntityNames = [...SYNC_ENTITIES];
        for (const ent of allEntityNames) {
          if (!snapshotEntities.has(ent)) {
            const table = getTable(ent);
            if (!table) continue;
            const localAll: any[] = await table.toArray();
            for (const local of localAll) {
              const key = `${ent}:${local.id}`;
              if (!pendingSet.has(key)) {
                await table.delete(local.id);
              }
            }
          }
        }
        await setServerRevision(currentRevision);
        await db.syncMeta.put({ key: "lastSuccessfulSyncAt", value: Date.now() });
      },
    );
  });
  emitDbSyncEvent(allChanges);
}

export async function applyBootstrapChanges(changes: SyncChange[], currentRevision: number): Promise<void> {
  if (changes.length === 0) {
    await setServerRevision(currentRevision);
    return;
  }
  await applyRemoteChanges(changes);
}
```

## CHANGE EXPLANATION

### Root Cause
Two coupled defects in the terminal-result arm of `syncPendingOperations` (`client.ts`), which ran inside `for (const r of result.results)`:
1. N qualifying terminal results → N sequential `fetchBootstrap()` + `applySnapshot()` full reconciliations per response (bandwidth + full IndexedDB reconciliations multiplied).
2. Each terminal's successors were rebased by `revertInFlightToTerminalAndRebaseSuccessors` to `currentRev` read BEFORE the authoritative snapshot; after the snapshot advanced the cursor, those successor `baseRevision` values were stale and would be rejected as stale on the next push (`checkStaleCrossClient`), producing avoidable conflict churn.

### Previous Per-Terminal Flow
Per terminal result, in order: match by `operationId` → helper marks terminal (`attempts+1`, error, successors rebased to pre-snapshot cursor, links cleared) → conflict logged → CREATE ghost deleted (if create) → `fetchBootstrap` + `applySnapshot` → terminal outbox row deleted → next result.

### New Batch-Level Flow
Per terminal result (in loop): match → capture successor ids (mirroring the helper's filter, BEFORE links are cleared) → helper (unchanged: terminal mark, single attempts increment, rebase to cursor) → conflict log (unchanged) → CREATE ghost delete (unchanged) → set `batchNeedsSnapshot` flag only when old `shouldFetchSnapshot` was true; record `{operationId, matchId}` for deferred deletion. After the results loop, once per response: shared `fetchBootstrap` + `applySnapshot` (same try/catch recoverability: on failure warn and continue to deletions, exactly as before) → rebase captured successors to `bootstrap.currentRevision` (guarded: skip missing/synced/terminal/in_flight rows) → delete recorded terminal rows (same `operationId`-then-`matchId` lookup order as before). Then the pre-existing canonical-entity loop runs unchanged.

### Exact Change
`client.ts` only: (a) batch collectors declared before the results loop; (b) per-result successor-id capture before the helper call; (c) in-loop snapshot+delete block replaced by flag/collection; (d) post-loop shared reconcile + successor correction + deferred deletion block. `queue.ts` and `apply.ts`: zero changes (verified identical).

### Why Bootstrap Runs Once
The fetch now lives outside the per-result loop and is guarded by a batch flag: 0 qualifying terminals → flag false → 0 fetches (Tests A, F, I); 1 qualifying terminal → 1 fetch (Test B); 2–3 qualifying terminals → 1 fetch (Tests C, D, E). Verified by transport call counts.

### Successor Revision Handling
Helper behavior preserved (rebase to pre-snapshot cursor). Post-loop correction overwrites captured successors' `baseRevision` with the authoritative `bootstrap.currentRevision`. Verified Test G: pre=10, bootstrap=15 → final `baseRevision=15`, links cleared, row preserved. On bootstrap failure (Test J) the correction is skipped and successors keep the helper's pre-snapshot rebase — identical to pre-fix failure behavior, still recoverable. No helper signature/semantics change was needed because capture happens client-side before link-clearing.

### Terminal Operation Cleanup Ordering
Snapshot first, cleanup second — same relative order as pre-fix. Terminal rows must survive until after `applySnapshot` (they did pre-fix per-result; now per-batch). Deletion uses the same lookup order (`operationId` row, else `matchId` row). Terminal rows remain excluded from snapshot pending protection in both states.

### PBS-BUG-007 Preservation
No `incrementAttemptsAndSetError` in the terminal path (closed-007 NOTE kept); helper executes exactly once per terminal. Verified Test H: attempts 3 → exactly one `attempts`-write of value 4 across the whole terminal cycle (update-call spy). Retryable path untouched (Tests E, I).

### Other PBS Bugs Explicitly Left Untouched
- PBS-BUG-009 (legacy bootstrap delete loss): `fetchBootstrap` legacy conversion untouched.
- PBS-BUG-010 (incremental pull pending overwrite): `apply.ts` untouched (verified zero diff).
- PBS-BUG-011 (cursor hardening): `applyRemoteChanges` untouched.
- PBS-BUG-002/006 (derived-write status, retry demotion): untouched.
- Dead `else if (isTerminal && isBusiness)` fallback branch: left byte-identical (still dead, out of scope).

### Files Modified
- `H.S.H-V2.0.0/frontend/src/services/sync/client.ts` (terminal-result batching only)
- `TEMP-PBS-BUG-008-AUDIT.md` (created: BEFORE x3 + AFTER x3 + this explanation)

### Files Deleted During Cleanup
- `TEMP-PBS-BUG-007-AUDIT.md` (closed-cycle audit, deleted per Step 1)
- `H.S.H-V2.0.0/frontend/TEMP-pbs008-verify.ts` (disposable harness for this cycle; all results recorded in the cycle summary; deleted after 28/28 passing)
- `H.S.H-V2.0.0/frontend/TEMP-dbg008.ts` (disposable debug script used to diagnose a harness expectation; deleted)
- `TEMP-splice008.cjs`, `TEMP-splice008b.cjs` (minute-lived exact-capture helpers; deleted immediately after use)
- `TEMP-splice008c.cjs`, `TEMP-check008.cjs`, `TEMP-check008b.cjs` (correction-cycle exact-capture/verify helpers; deleted immediately after use)
- `H.S.H-V2.0.0/frontend/TEMP-pbs008c-verify.ts`, `TEMP-pbs008c-out.txt` (superseded correction-cycle harness + output; deleted), `H.S.H-V2.0.0/frontend/TEMP-pbs008d-verify.ts`, `TEMP-pbs008d-out.txt` (final correction-cycle disposable harness + output; deleted after 42/42 passing)

## GIORNO REVIEW CORRECTION

### Review Finding
The first PBS-BUG-008 fix used a successor-capture predicate narrower than the queue helper.

### Previous Capture Predicate
```ts
if (o.synced || o.operationId === operationId) continue;
const linked = dep === operationId || parent === operationId;
const sibling = sameEntity && st === "pending" && !dep && !parent;
if ((linked && st !== "terminal" && st !== "in_flight") || sibling) {
  if (o.operationId && ...) push(o.operationId);
}
```
Narrower in three ways: same-key branch required `status === "pending"`; required link absence; linked branch excluded `terminal`; correction keyed by `operationId` (unusable for legacy rows).

### Queue Helper Predicate
`revertInFlightToTerminalAndRebaseSuccessors` (`queue.ts`):
```ts
(o.dependsOnOperationId === operationId || o.parentOperationId === operationId ||
 (o.entity === op.entity && o.entityId === op.entityId))
&& o.id !== op.id && !o.synced && o.status !== "in_flight"
```
No pending requirement, no link-absence requirement, no terminal exclusion; parent excluded by numeric `id`.

### Corrected Capture Predicate
```ts
if (o.synced || o.operationId === operationId) continue;
const linked = dep === operationId || parent === operationId;
const sameEntity = o.entity === r.entity && o.entityId === r.entityId;
if ((linked || sameEntity) && !o.synced && st !== "in_flight") {
  if (typeof o.id === "number" && !batchTerminalSuccessorRowIds.includes(o.id)) push(o.id);
}
```
Correction reloads by numeric `get(rowId)` and skips rows now synced/terminal/in_flight. `queue.ts` semantics untouched (Step 5 honored — no helper change was needed).

### Why They Now Cover The Same Push-Relevant Rows
Domain equality: linked-clause identical; same-entity clause identical (entity from server-echoed result equals the parent row's entity for the same operationId); exclusions identical (`!synced`, `!== in_flight`, parent excluded — by unique `operationId`, equivalent to the helper's numeric-id exclusion since the parent always carries the operationId here). The only deliberate difference: correction-time guard skips rows that have since become synced/terminal/in_flight, which by definition are not pending future pushes. Terminal rows the helper touched pre-correction are therefore covered by capture yet correctly left alone (Test N).

### Additional Tests K-N
- K (same-key retrying injected mid-cycle inside mocked POST after the outgoing batch froze with bodies[0]=["KP"]; row state retrying/base 10 at insert, never transitioned pre-capture): PASS (write sequence [10,15] = helper then correction; final `baseRevision: 15`).
- L (legacy row without `operationId`, unset status, blocked from sending): PASS (`baseRevision: 15` via numeric-id correction). Incidental discovery (documented, NOT fixed — out of scope): once the helper clears such a row's links it becomes sendable, and `transitionPendingToInFlight`'s `where("operationId").equals(undefined)` readback throws `Invalid key`, aborting the cycle. Reachability in production requires opId-less rows, which the current outbox writer always populates; recorded here for a future cycle.
- M (same-key pending with foreign dependency intact at capture: MP result ordered first, MO absent from frozen batch bodies[0]=["MP","OTHER"]): PASS (write sequence [10,15]; final `baseRevision: 15`; helper-cleared links left as the helper set them).
- N (pre-terminal same-key row): PASS (guard skips; stays `terminal` at pre-snapshot `baseRevision: 10`).
- Full A–J re-run plus 004/005/007 regressions in the same harness: 42/42 PASS total (E/I retryable transitions proven via per-send attempts progression; H: exactly one attempts-write of 4; K/M write-sequence [10,15] proving helper-then-correction).
