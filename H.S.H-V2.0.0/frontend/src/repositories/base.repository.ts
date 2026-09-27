import type { Table } from "dexie";
import { db } from "../lib/database/db";
import { generateId } from "../lib/id";
import type { SyncEntity } from "../types/sync/sync";
import { coalescePendingOperations } from "../services/sync/queue";

let triggerSyncFn: (() => void) | null = null;
export function setTriggerSync(fn: () => void) {
  triggerSyncFn = fn;
}
function triggerSync() {
  if (triggerSyncFn) {
    try {
      triggerSyncFn();
    } catch {}
  } else {
    import("../services/sync/manager").then((m) => m.triggerSync()).catch(() => {});
  }
}

type SourceOption = { source?: "local" | "remote"; serverRevision?: number; queueSync?: boolean };

// PBS-BUG-002: whether this exact entity/id has its own upload waiting in the
// outbox. Matches PBS-BUG-010's active-intent domain: same entity+entityId,
// !synced, status !== "terminal" (pending/retrying/in_flight/legacy-unset count;
// synced/terminal do not). NEVER consults entity syncStatus. Read-only: callers
// must not create/modify/coalesce outbox rows based on this.
async function hasActiveDirectOutbox(entityName: SyncEntity, entityId: string): Promise<boolean> {
  const all = await db.syncOperations.toArray();
  return all.some(
    (o) => o.entity === entityName && o.entityId === entityId && !o.synced && (o as any).status !== "terminal",
  );
}

export class BaseRepository<T extends { id: string } & { syncStatus?: string; lastSyncedAt?: number; serverRevision?: number; updatedAt?: number }> {
  constructor(
    protected readonly table: Table<T, string>,
    protected readonly entityName?: SyncEntity,
  ) {}

  async getById(id: string): Promise<T | undefined> {
    return this.table.get(id);
  }

  async getAll(): Promise<T[]> {
    return this.table.toArray();
  }

  async create(entity: T, opts: SourceOption = {}): Promise<string> {
    const source = opts.source ?? "local";
    const queueSync = opts.queueSync ?? true;
    const now = Date.now();
    const toStore: T = { ...entity } as T;
    if (source === "local") {
      const entityName = this.entityName;
      if (entityName && queueSync) {
        (toStore as any).syncStatus = "pending";
        (toStore as any).updatedAt = (toStore as any).updatedAt ?? now;
        const opId = generateId();
        const baseRevision = await db.syncMeta.get("serverRevision").then((r) => (typeof r?.value === "number" ? (r.value as number) : 0)).catch(() => 0);
        let clientId = "unknown";
        try {
          const c = await db.syncMeta.get("clientId");
          if (c?.value && typeof c.value === "string") clientId = c.value as string;
          else {
            clientId = generateId();
            await db.syncMeta.put({ key: "clientId", value: clientId });
          }
        } catch {}
        const doCreate = async () => {
          await this.table.add(toStore);
          await coalescePendingOperations(entityName, toStore.id, "create", toStore as any, {
            operationId: opId,
            baseRevision,
            clientId,
            createdAt: now,
          });
        };
        const currentTx: any = (await import("dexie")).default.currentTransaction;
        if (currentTx) {
          await doCreate();
        } else {
          await db.transaction("rw", this.table, db.syncOperations, db.syncMeta, doCreate);
        }
      } else if (entityName && !queueSync) {
        // Local optimistic derived mutation — do not queue sync, just update Dexie.
        // PBS-BUG-002: no independent entity upload exists, so the row is "synced"
        // (the authoritative parent business op carries the pending intent, and
        // PBS-BUG-010 protects this row from conflicting pulls via that parent).
        // Do NOT set lastSyncedAt: never independently server-confirmed.
        (toStore as any).syncStatus = "synced";
        (toStore as any).updatedAt = (toStore as any).updatedAt ?? now;
        await this.table.add(toStore);
      } else {
        await this.table.add(toStore);
      }
      if (queueSync) triggerSync();
    } else {
      const { runAsRemote } = await import("../lib/database/sync-hooks");
      await runAsRemote(async () => {
        (toStore as any).syncStatus = "synced";
        (toStore as any).lastSyncedAt = now;
        if (opts.serverRevision !== undefined) (toStore as any).serverRevision = opts.serverRevision;
        await this.table.put(toStore);
      });
    }
    return toStore.id;
  }

  async update(id: string, changes: Partial<T>, opts: SourceOption = {}): Promise<void> {
    const source = opts.source ?? "local";
    const queueSync = opts.queueSync ?? true;
    if (source === "local") {
      const now = Date.now();
      const baseChanges: any = { ...changes, updatedAt: now };
      const entityName = this.entityName;
      if (entityName && queueSync) {
        const mergedChanges: any = { ...baseChanges, syncStatus: "pending" };
        let baseRevision = 0;
        let clientId = "unknown";
        try {
          const existing: any = await this.table.get(id);
          baseRevision = existing?.serverRevision ?? 0;
          if (baseRevision === 0) {
            const meta = await db.syncMeta.get("serverRevision");
            if (typeof meta?.value === "number") baseRevision = meta.value as number;
          }
        } catch {}
        try {
          const c = await db.syncMeta.get("clientId");
          if (c?.value && typeof c.value === "string") clientId = c.value as string;
          else {
            clientId = generateId();
            await db.syncMeta.put({ key: "clientId", value: clientId });
          }
        } catch {}
        const opId = generateId();
        const payload = { id, ...changes, updatedAt: now };
        const doUpdate = async () => {
          await this.table.update(id, mergedChanges);
          await coalescePendingOperations(entityName, id, "update", payload as any, {
            operationId: opId,
            baseRevision,
            clientId,
            createdAt: now,
          });
        };
        const currentTx: any = (await import("dexie")).default.currentTransaction;
        if (currentTx) {
          await doUpdate();
        } else {
          await db.transaction("rw", this.table, db.syncOperations, db.syncMeta, doUpdate);
        }
      } else if (entityName && !queueSync) {
        // PBS-BUG-002: this mutation itself has no independent upload. Mark "synced"
        // UNLESS an active direct outbox operation for this exact entity/id is still
        // queued (then the row genuinely awaits upload and stays "pending"). This also
        // heals stale "pending" left by the old behavior when no direct intent exists.
        // Read-only w.r.t. the outbox: never creates/modifies/coalesces rows here.
        // Never consults entity syncStatus and never the parent business op (see
        // PBS-BUG-010 coupling: protection follows outbox intent, status follows
        // direct upload state).
        const doLocalUpdate = async () => {
          const hasActive = await hasActiveDirectOutbox(entityName, id);
          await this.table.update(id, { ...baseChanges, syncStatus: hasActive ? "pending" : "synced" });
        };
        const currentTxLocal: any = (await import("dexie")).default.currentTransaction;
        if (currentTxLocal) {
          await doLocalUpdate();
        } else {
          await db.transaction("rw", this.table, db.syncOperations, doLocalUpdate);
        }
      } else {
        await this.table.update(id, { ...baseChanges, syncStatus: "pending" });
      }
      if (queueSync) triggerSync();
    } else {
      const { runAsRemote } = await import("../lib/database/sync-hooks");
      await runAsRemote(async () => {
        const now = Date.now();
        const toApply: any = { ...changes, lastSyncedAt: now, syncStatus: "synced" };
        if (opts.serverRevision !== undefined) toApply.serverRevision = opts.serverRevision;
        await this.table.update(id, toApply);
        const exists = await this.table.get(id);
        if (!exists) {
          const full = { id, ...changes, syncStatus: "synced", lastSyncedAt: now, serverRevision: opts.serverRevision } as unknown as T;
          await this.table.put(full);
        }
      });
    }
  }

  async delete(id: string, opts: SourceOption = {}): Promise<void> {
    const source = opts.source ?? "local";
    if (source === "local") {
      const entityName = this.entityName;
      if (entityName) {
        let baseRevision = 0;
        let clientId = "unknown";
        try {
          const existing: any = await this.table.get(id);
          baseRevision = existing?.serverRevision ?? 0;
          if (baseRevision === 0) {
            const meta = await db.syncMeta.get("serverRevision");
            if (typeof meta?.value === "number") baseRevision = meta.value as number;
          }
        } catch {}
        try {
          const c = await db.syncMeta.get("clientId");
          if (c?.value && typeof c.value === "string") clientId = c.value as string;
          else {
            clientId = generateId();
            await db.syncMeta.put({ key: "clientId", value: clientId });
          }
        } catch {}
        const opId = generateId();
        const nowDel = Date.now();
        const doDelete = async () => {
          await this.table.delete(id);
          await coalescePendingOperations(entityName, id, "delete", { id } as any, {
            operationId: opId,
            baseRevision,
            clientId,
            createdAt: nowDel,
          });
        };
        const currentTx: any = (await import("dexie")).default.currentTransaction;
        if (currentTx) {
          await doDelete();
        } else {
          await db.transaction("rw", this.table, db.syncOperations, db.syncMeta, doDelete);
        }
      } else {
        await this.table.delete(id);
      }
      triggerSync();
    } else {
      const { runAsRemote } = await import("../lib/database/sync-hooks");
      await runAsRemote(async () => {
        await this.table.delete(id);
      });
    }
  }

  // Remote apply helpers — never queue
  async applyRemoteCreate(entity: T, serverRevision: number): Promise<void> {
    await this.create(entity, { source: "remote", serverRevision });
  }

  async applyRemoteUpdate(id: string, entity: Partial<T> & { id: string }, serverRevision: number): Promise<void> {
    const existing = await this.table.get(id);
    if (existing) {
      await this.update(id, { ...entity, syncStatus: "synced", lastSyncedAt: Date.now(), serverRevision } as any, { source: "remote", serverRevision });
    } else {
      await this.create(entity as T, { source: "remote", serverRevision });
    }
  }

  async applyRemoteDelete(id: string): Promise<void> {
    await this.delete(id, { source: "remote" });
  }

  async upsert(entity: T, opts: SourceOption = {}): Promise<void> {
    const exists = await this.table.get(entity.id);
    if (exists) {
      await this.update(entity.id, entity as Partial<T>, opts);
    } else {
      await this.create(entity, opts);
    }
  }
}
