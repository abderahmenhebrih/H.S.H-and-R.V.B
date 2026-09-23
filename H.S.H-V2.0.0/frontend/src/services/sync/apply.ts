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
