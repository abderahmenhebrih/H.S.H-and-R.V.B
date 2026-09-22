import { db } from "../lib/database/db";
import type { Settings } from "../types/settings/settings";

const SETTINGS_ID = "settings";

type StoredSettings = Settings & {
  id: string;
} & { syncStatus?: string; serverRevision?: number; lastSyncedAt?: number };

export class SettingsRepository {
  async get(): Promise<Settings | undefined> {
    const settings = await db.settings.get(SETTINGS_ID);
    return settings;
  }

  async save(settings: Settings, opts: { source?: "local" | "remote"; serverRevision?: number } = {}): Promise<void> {
    const source = opts.source ?? "local";
    const storedSettings: StoredSettings = {
      id: SETTINGS_ID,
      ...settings,
    };
    if (source === "local") {
      (storedSettings as any).syncStatus = "pending";
      const { generateId } = await import("../lib/id");
      const opId = generateId();
      let baseRevision = 0;
      let clientId = "unknown";
      try {
        const meta = await db.syncMeta.get("serverRevision");
        if (typeof meta?.value === "number") baseRevision = meta.value as number;
      } catch {}
      try {
        const c = await db.syncMeta.get("clientId");
        if (c?.value && typeof c.value === "string") clientId = c.value as string;
        else {
          clientId = generateId();
          await db.syncMeta.put({ key: "clientId", value: clientId });
        }
      } catch {}
      await db.transaction("rw", db.settings, db.syncOperations, db.syncMeta, async () => {
        await db.settings.put(storedSettings);
        await db.syncOperations.add({
          operationId: opId,
          entity: "settings",
          entityId: SETTINGS_ID,
          operation: "upsert",
          payload: storedSettings,
          createdAt: Date.now(),
          synced: false,
          attempts: 0,
          baseRevision,
          clientId,
          status: "pending",
        } as any);
      });
      import("../services/sync/manager").then((m) => m.triggerSync()).catch(() => {});
    } else {
      const { runAsRemote } = await import("../lib/database/sync-hooks");
      await runAsRemote(async () => {
        (storedSettings as any).syncStatus = "synced";
        (storedSettings as any).lastSyncedAt = Date.now();
        if (opts.serverRevision !== undefined) (storedSettings as any).serverRevision = opts.serverRevision;
        await db.settings.put(storedSettings);
      });
    }
  }

  async applyRemote(settings: Settings, serverRevision: number): Promise<void> {
    return this.save(settings, { source: "remote", serverRevision });
  }

  async delete(opts: { source?: "local" | "remote" } = {}): Promise<void> {
    const source = opts.source ?? "local";
    if (source === "local") {
      const { generateId } = await import("../lib/id");
      const opId = generateId();
      let baseRevision = 0;
      let clientId = "unknown";
      try {
        const meta = await db.syncMeta.get("serverRevision");
        if (typeof meta?.value === "number") baseRevision = meta.value as number;
      } catch {}
      try {
        const c = await db.syncMeta.get("clientId");
        if (c?.value && typeof c.value === "string") clientId = c.value as string;
        else {
          clientId = generateId();
          await db.syncMeta.put({ key: "clientId", value: clientId });
        }
      } catch {}
      await db.transaction("rw", db.settings, db.syncOperations, db.syncMeta, async () => {
        await db.settings.delete(SETTINGS_ID);
        await db.syncOperations.add({
          operationId: opId,
          entity: "settings",
          entityId: SETTINGS_ID,
          operation: "delete",
          payload: { id: SETTINGS_ID },
          createdAt: Date.now(),
          synced: false,
          attempts: 0,
          baseRevision,
          clientId,
          status: "pending",
        } as any);
      });
      import("../services/sync/manager").then((m) => m.triggerSync()).catch(() => {});
    } else {
      const { runAsRemote } = await import("../lib/database/sync-hooks");
      await runAsRemote(async () => {
        await db.settings.delete(SETTINGS_ID);
      });
    }
  }
}

export const settingsRepository = new SettingsRepository();
