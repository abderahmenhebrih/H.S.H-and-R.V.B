import { db } from "@/src/lib/database/db";
import { getServerRevision } from "./queue";

const LEGACY_FLAG = "legacySyncBackfillCompleted";

export async function runLegacyBackfill(): Promise<void> {
  const flag = await db.syncMeta.get(LEGACY_FLAG);
  if (flag) {
    return;
  }

  console.log("[sync] legacy backfill starting");
  const tables: Array<{ name: string; entity: string }> = [
    { name: "products", entity: "product" },
    { name: "suppliers", entity: "supplier" },
    { name: "customers", entity: "customer" },
    { name: "bankAccounts", entity: "bankAccount" },
    { name: "vehicles", entity: "vehicle" },
    { name: "workers", entity: "worker" },
    { name: "expenses", entity: "expense" },
    { name: "tasks", entity: "task" },
    { name: "purchases", entity: "purchase" },
    { name: "sales", entity: "sale" },
    { name: "payments", entity: "payment" },
    { name: "transfers", entity: "transfer" },
    { name: "injuryEquations", entity: "injuryEquation" },
    { name: "settings", entity: "settings" },
    { name: "notifications", entity: "notification" },
  ];

  const pendingOps = await db.syncOperations.toArray();
  const pendingSet = new Set(pendingOps.filter((o) => !o.synced).map((o) => `${o.entity}:${o.entityId}`));

  let queued = 0;
  const serverRevision = await getServerRevision();

  for (const { name, entity } of tables) {
    const table: any = (db as any)[name];
    if (!table) continue;
    const all: any[] = await table.toArray();
    for (const rec of all) {
      const id = rec.id;
      if (!id) continue;
      // Skip if already has serverRevision (means it was synced at least once)
      if (typeof rec.serverRevision === "number") continue;
      // Skip if already has pending operation
      if (pendingSet.has(`${entity}:${id}`)) continue;
      // Skip if rec is from remote sync (has syncStatus synced but no serverRevision? Actually remote has serverRevision)
      // For legacy, we consider any record without serverRevision as needing backfill
      // But avoid queuing settings that is singleton and may be empty?
      // Queue as create (or update) – use create for backfill
      const opId = `legacy-${entity}-${id}`;
      const existing = await db.syncOperations.where("operationId").equals(opId).first().catch(() => null);
      if (existing) continue;
      await db.syncOperations.add({
        operationId: opId,
        entity,
        entityId: id,
        operation: "upsert",
        payload: rec,
        createdAt: Date.now() - 1000 * 60 * 60 * 24,
        synced: false,
        attempts: 0,
        baseRevision: 0,
        clientId: "legacy-backfill",
        status: "pending",
      } as any);
      queued++;
    }
  }

  await db.syncMeta.put({ key: LEGACY_FLAG, value: true });
  console.log(`[sync] legacy backfill completed, queued ${queued} records`);
}
