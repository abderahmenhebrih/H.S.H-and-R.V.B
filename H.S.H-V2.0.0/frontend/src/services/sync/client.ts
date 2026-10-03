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

// Single normalized sync API base. Vercel env values may carry a trailing
// slash; without trimming, every sync URL becomes //api/... which Express
// rejects with 404. All sync requests below must use this, never the raw env.
function getSyncApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
  return raw.replace(/\/+$/, "");
}

export async function syncPendingOperations(): Promise<SyncResponse> {
  const clientId = await getOrCreateClientId();
  const apiBase = getSyncApiBase();
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
          const { preserveSettingsNavigation } = await import("./apply");
          const table = getTableForEntity(r.entity);
          if (table) {
            const canon: any = r.canonicalEntity;
            canon.syncStatus = "synced";
            canon.lastSyncedAt = Date.now();
            if (r.revision) canon.serverRevision = r.revision;
            // A server echo without a valid navigationStyle must not erase the
            // local canonical choice (same guard as the pull paths).
            await preserveSettingsNavigation(r.entity, r.entityId, canon, (id) => table.get(id));
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
  const apiBase = getSyncApiBase();
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
  const apiBase = getSyncApiBase();
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
  const apiBase = getSyncApiBase();
  try {
    const res = await fetch(`${apiBase}/api/sync/status`);
    if (!res.ok) return 0;
    const data = await res.json();
    return data.currentRevision ?? 0;
  } catch {
    return 0;
  }
}
