import type { Table } from "dexie";
import { db } from "../lib/database/db";
import { generateId } from "../lib/id";
import type { SyncEntity } from "../types/sync/sync";

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

type SourceOption = { source?: "local" | "remote"; serverRevision?: number };

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
    const now = Date.now();
    const toStore: T = { ...entity } as T;
    if (source === "local") {
      (toStore as any).syncStatus = "pending";
      (toStore as any).updatedAt = (toStore as any).updatedAt ?? now;
      const opId = generateId();
      const entityName = this.entityName;
      if (entityName) {
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
          await db.syncOperations.add({
            operationId: opId,
            entity: entityName,
            entityId: toStore.id,
            operation: "create",
            payload: toStore,
            createdAt: now,
            synced: false,
            attempts: 0,
            baseRevision,
            clientId,
            status: "pending",
          } as any);
        };
        // Use existing transaction if already in one, otherwise start new
        const currentTx: any = (await import("dexie")).default.currentTransaction;
        if (currentTx) {
          await doCreate();
        } else {
          await db.transaction("rw", this.table, db.syncOperations, db.syncMeta, doCreate);
        }
      } else {
        await this.table.add(toStore);
      }
      triggerSync();
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
    if (source === "local") {
      const now = Date.now();
      const mergedChanges: any = { ...changes, updatedAt: now, syncStatus: "pending" };
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
        const payload = { id, ...changes, updatedAt: now };
        const doUpdate = async () => {
          await this.table.update(id, mergedChanges);
          await db.syncOperations.add({
            operationId: opId,
            entity: entityName,
            entityId: id,
            operation: "update",
            payload,
            createdAt: now,
            synced: false,
            attempts: 0,
            baseRevision,
            clientId,
            status: "pending",
          } as any);
        };
        const currentTx: any = (await import("dexie")).default.currentTransaction;
        if (currentTx) {
          await doUpdate();
        } else {
          await db.transaction("rw", this.table, db.syncOperations, db.syncMeta, doUpdate);
        }
      } else {
        await this.table.update(id, mergedChanges);
      }
      triggerSync();
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
        const doDelete = async () => {
          await this.table.delete(id);
          await db.syncOperations.add({
            operationId: opId,
            entity: entityName,
            entityId: id,
            operation: "delete",
            payload: { id },
            createdAt: Date.now(),
            synced: false,
            attempts: 0,
            baseRevision,
            clientId,
            status: "pending",
          } as any);
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
