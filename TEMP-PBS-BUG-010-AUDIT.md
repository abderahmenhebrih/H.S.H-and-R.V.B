# PBS-BUG-010 Audit

## Target
PBS-BUG-010 — incremental pull overwrites active optimistic local state

## Primary Source File
H.S.H-V2.0.0/frontend/src/services/sync/apply.ts

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

## PRE-FIX COUPLING ANALYSIS

### Direct Outbox Protection
Missing: `applyRemoteChanges` builds no pending set; every create/update reaches `table.put(toStore)` and every delete reaches `table.delete(id)` unconditionally.

### Entity syncStatus Is Not Protection
Protection must derive from active `syncOperations` rows (`!synced && status !== "terminal"`), never from entity `syncStatus`. Rationale (PBS-BUG-002, OPEN): `queueSync:false` derived writes carry `syncStatus:"pending"` with no outbox row; guarding on entity status would strand them permanently (they are also excluded from snapshot reconciliation... actually snapshot protects pendingSet keys only — derived rows without outbox rows are NOT in snapshot pendingSet and get overwritten by canonical server state, which is their intended convergence path; an entity-status guard in incremental pull would break that convergence).

### Business Derived-Key Protection
`applySnapshot` extends its pending set with `collectBusinessAffectedKeys(op, localEntity)` for every unsynced non-terminal sale/purchase/payment/transfer op (including in_flight). Incremental pull must honor the same derived keys so a server product/customer/supplier/bankAccount change does not clobber optimistic balances/stock tied to an in-flight business op.

### PBS-BUG-002 Interaction
002 is OPEN and untouched. Derived rows with `syncStatus:"pending"` but no outbox row MUST still accept canonical server changes in incremental pull (Test J). Conversely, rows WITH active outbox intent (including business-derived keys) must be preserved (Tests A–D, K–M).

### PBS-BUG-011 Boundary
Cursor (`setServerRevision(maxRevision)`), malformed-payload skip, and maxRevision semantics are NOT modified. Skips due to pending protection still advance the cursor: the revision was seen and deliberately fenced, not failed — distinct from 011's payload-less gap. 011 remains DESIGN/HARDENING, untouched.

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
  // PBS-BUG-010: include syncOperations so the pending-protection set below is built
  // from a transactionally consistent outbox view (single scan, no N+1 queries).
  const remoteTables = [...new Set([...syncTables, db.syncMeta, db.syncOperations])];
  await runAsRemote(async () => {
    await db.transaction(
      "rw",
      remoteTables,
      async () => {
        // PBS-BUG-010: protect records with active local sync intent, derived from
        // actual outbox operations — NEVER from entity syncStatus (PBS-BUG-002 stays
        // open: queueSync:false derived rows carry syncStatus:"pending" with no outbox
        // row and must still accept canonical server changes). Mirrors applySnapshot:
        // direct entity:id keys for every unsynced non-terminal op (in_flight included),
        // extended with business-derived affected keys for active sale/purchase/payment/
        // transfer operations.
        const allOps = await db.syncOperations.toArray();
        const pendingSet = new Set<string>(
          allOps
            .filter((o: any) => !o.synced && o.status !== "terminal")
            .map((o) => `${o.entity}:${o.entityId}`),
        );
        const businessEntities = new Set(["sale", "purchase", "payment", "transfer"]);
        for (const op of allOps) {
          if (!businessEntities.has((op as any).entity)) continue;
          if ((op as any).synced) continue;
          if ((op as any).status === "terminal") continue;
          let localEntity: any = null;
          try {
            const entityTable = getTable((op as any).entity);
            if (entityTable) localEntity = await entityTable.get((op as any).entityId);
          } catch {}
          const affected = collectBusinessAffectedKeys(op as any, localEntity);
          for (const k of affected) pendingSet.add(k);
        }
        for (const change of toApply) {
          // Direct table ops without going through applyRemoteChange's runAsRemote (already in remote context)
          const table = getTable(change.entity);
          if (!table) continue;
          // PBS-BUG-010: never overwrite or delete optimistic local state that still
          // has active outbox intent. The local op will later succeed (authoritative
          // state follows) or fail into existing reconciliation. Skipped revisions
          // still advance the cursor below: the revision was seen and deliberately
          // fenced, not failed (PBS-BUG-011 untouched).
          const changeKey = `${change.entity}:${change.entityId}`;
          if (pendingSet.has(changeKey)) continue;
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
`applyRemoteChanges` applied every incremental create/update via unconditional `table.put` and every delete via unconditional `table.delete`, with no notion of active local sync intent — while `applySnapshot` (same file) already protected pending rows via an outbox-derived `pendingSet`. The `hasPendingOperation` helper that could have guarded the incremental path had zero callers (eslint-proven dead code).

### Exact Fix
`apply.ts` only: (a) removed dead `hasPendingOperation`; (b) added `db.syncOperations` to the pull transaction tables (single consistent view, no N+1); (c) build `pendingSet` once per call from active outbox rows (`!synced && status !== "terminal"`, in_flight included — mirroring snapshot) extended with `collectBusinessAffectedKeys` for active sale/purchase/payment/transfer ops (local entity read in-transaction); (d) `if (pendingSet.has(entity:entityId)) continue` before both put and delete arms. Cursor, malformed-payload skip, events, and toasts unchanged.

### Protection-Set Construction
One `toArray()` inside the pull transaction; direct keys + business-derived keys; identical filter semantics to `applySnapshot` (`!o.synced && o.status !== "terminal"`).

### Direct-Key Protection
Tests A–D: pending update/create/delete outbox rows fence their entity:id against remote update/create/delete. Outbox rows intact.

### Business-Derived-Key Protection
Tests K–M: active sale op fences `product:<pid>` + `customer:<cid>` via existing `collectBusinessAffectedKeys` mapping (payload + local-entity items); terminal business op fences nothing; consumed business op releases protection (Test L).

### Remote Delete Protection
Tests D (pending update survives remote delete), C (pending delete not resurrected by remote create), G/N (unprotected deletes still apply).

### PBS-BUG-002 Safety
Test J proves the guard is outbox-derived, not status-derived: a row with `syncStatus:"pending"` and no active outbox row still accepts canonical server changes. 002 untouched (its function and semantics byte-identical).

### PBS-BUG-011 Preservation
`setServerRevision(maxRevision)` and the payload-less `continue` are byte-identical. Tests O (cursor advances past a protection skip to max) and P (malformed handling: no throw, cursor=max, normal row applies) prove no behavior change. 011 untouched.

### Files Modified
- `H.S.H-V2.0.0/frontend/src/services/sync/apply.ts` (pending protection + dead-helper removal only)
- `TEMP-PBS-BUG-010-AUDIT.md` (created: BEFORE + coupling analysis + AFTER + this explanation)

### Files Deleted During Cleanup
- `TEMP-PBS-BUG-008-AUDIT.md` (closed-cycle audit, deleted per Step 1)
- `H.S.H-V2.0.0/frontend/TEMP-pbs010-verify.ts`, `TEMP-pbs010-out.txt` (disposable A–P harness + output; deleted after 34/34 passing)
- `TEMP-splice010.cjs`, `TEMP-splice010b.cjs` (minute-lived exact-capture helpers; deleted immediately after use)
