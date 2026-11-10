import { db } from "@/src/lib/database/db";
import { fetchSnapshotPage } from "./client";
import { applySnapshotEntity, finalizeSnapshotMigration } from "./apply";
import { SYNC_ENTITIES } from "./tables";

const PROGRESS_KEY = "snapshotMigration";
const PAGE_LIMIT = 200;

interface MigrationProgress {
  entityIndex: number;
  cursor: string | null;
  revision: number;
  startedAt: number;
}

/**
 * Chunked snapshot migration: walks every SYNC_ENTITIES collection through
 * GET /api/sync/snapshot (keyset pages), applying per-entity with the same
 * pending-fence semantics as the legacy bootstrap. Memory bounded by the
 * largest single entity. Progress persisted in syncMeta so an interrupted
 * run resumes instead of restarting. Returns the snapshot revision.
 * Throws on transport failure — caller falls back to legacy /bootstrap
 * (already-applied entity pages are pending-protected upserts, so fallback
 * converges without data loss).
 */
export async function runSnapshotMigration(): Promise<number> {
  let progress: MigrationProgress | null = null;
  try {
    const rec = await db.syncMeta.get(PROGRESS_KEY);
    progress = (rec?.value as MigrationProgress) ?? null;
  } catch {}
  let startIndex = 0;
  if (progress && Number.isInteger(progress.entityIndex) && progress.entityIndex >= 0 && progress.entityIndex < SYNC_ENTITIES.length) {
    startIndex = progress.entityIndex;
  }
  let snapshotRevision = progress?.revision ?? 0;
  for (let i = startIndex; i < SYNC_ENTITIES.length; i++) {
    const entity = SYNC_ENTITIES[i] as string;
    let cursor: string | null = i === startIndex ? progress?.cursor ?? null : null;
    const docs: any[] = [];
    let pageRevision = snapshotRevision;
    for (;;) {
      const page = await fetchSnapshotPage(entity, cursor, PAGE_LIMIT);
      if (pageRevision === 0) pageRevision = page.currentRevision;
      for (const d of page.docs) docs.push(d);
      try {
        await db.syncMeta.put({ key: PROGRESS_KEY, value: { entityIndex: i, cursor: page.nextCursor, revision: pageRevision, startedAt: Date.now() } });
      } catch {}
      if (!page.hasMore) break;
      cursor = page.nextCursor;
    }
    await applySnapshotEntity(entity, docs);
    snapshotRevision = pageRevision;
    try {
      await db.syncMeta.put({ key: PROGRESS_KEY, value: { entityIndex: i + 1, cursor: null, revision: snapshotRevision, startedAt: Date.now() } });
    } catch {}
  }
  await finalizeSnapshotMigration(snapshotRevision);
  try {
    await db.syncMeta.delete(PROGRESS_KEY);
  } catch {}
  return snapshotRevision;
}
