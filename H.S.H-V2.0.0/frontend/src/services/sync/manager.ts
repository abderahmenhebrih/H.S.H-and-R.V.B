import { getServerRevision, setServerRevision, getPendingSyncOperations, getOrCreateClientId } from "./queue";
import { syncPendingOperations, fetchRemoteChanges, fetchBootstrap } from "./client";
import { applyRemoteChanges, applyBootstrapChanges } from "./apply";
import { db } from "@/src/lib/database/db";
import { setupSyncHooks } from "@/src/lib/database/sync-hooks";
import { runLegacyBackfill } from "./migrate";

let syncInProgress = false;
let syncPromise: Promise<void> | null = null;
let periodicTimer: any = null;
let lastSyncAt = 0;

export type SyncState = "idle" | "syncing" | "synced" | "offline" | "error";

let currentState: SyncState = "idle";
const listeners: Set<(s: SyncState) => void> = new Set();

function setState(s: SyncState) {
  currentState = s;
  for (const l of listeners) l(s);
}

export function subscribeSyncState(cb: (s: SyncState) => void): () => void {
  listeners.add(cb);
  cb(currentState);
  return () => listeners.delete(cb);
}

export function getSyncState(): SyncState {
  return currentState;
}

export async function getPendingSyncCount(): Promise<number> {
  const ops = await getPendingSyncOperations();
  return ops.length;
}

export async function getCurrentServerRevision(): Promise<number> {
  return getServerRevision();
}

export async function getLastSuccessfulSync(): Promise<number | undefined> {
  const rec = await db.syncMeta.get("lastSuccessfulSyncAt");
  return rec?.value as number | undefined;
}

async function pushPhase(): Promise<void> {
  const pending = await getPendingSyncOperations();
  if (pending.length === 0) return;
  console.log(`[sync] pushing ${pending.length} operations`);
  setState("syncing");
  try {
    await syncPendingOperations();
    console.log(`[sync] push completed`);
  } catch (e) {
    console.warn(`[sync] push failed`, e);
    // Keep pending, will retry later
    throw e;
  }
}

async function pullPhase(): Promise<void> {
  let after = await getServerRevision();
  if (after === 0) {
    try {
      const bootstrap = await fetchBootstrap();
      // New snapshot format — always reconcile, even if empty (canonical empty)
      if ((bootstrap as any).snapshot) {
        const snap = (bootstrap as any).snapshot as Record<string, any[]>;
        const count = Object.values(snap).reduce((acc: number, arr: any) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
        console.log(`[sync] bootstrap snapshot ${count} records at rev ${bootstrap.currentRevision}`);
        const { applySnapshot } = await import("./apply");
        await applySnapshot(snap, bootstrap.currentRevision);
        after = bootstrap.currentRevision;
        console.log(`[sync] bootstrap snapshot applied, now at ${after}`);
      } else if ((bootstrap as any).changes) {
        // Legacy fallback — also always reconcile
        const ch = (bootstrap as any).changes as any[];
        console.log(`[sync] bootstrap ${ch.length} changes at rev ${bootstrap.currentRevision}`);
        await applyBootstrapChanges(ch, bootstrap.currentRevision);
        after = bootstrap.currentRevision;
        console.log(`[sync] bootstrap applied, now at ${after}`);
      }
    } catch (e) {
      console.warn(`[sync] bootstrap failed`, e);
    }
  }

  let hasMore = true;
  let totalPulled = 0;
  while (hasMore) {
    try {
      const res = await fetchRemoteChanges(after, 200);
      if (res.changes.length === 0) {
        // No new changes
        if (res.currentRevision !== after) {
          await setServerRevision(res.currentRevision);
        }
        hasMore = false;
        break;
      }
      // Filter out changes that originated from this client (optional, but we still apply to ensure convergence)
      // We apply all to guarantee canonical state
      console.log(`[sync] pulled revisions ${after} -> ${res.nextRevision} (${res.changes.length})`);
      await applyRemoteChanges(res.changes);
      totalPulled += res.changes.length;
      after = res.nextRevision;
      hasMore = res.hasMore;
      if (hasMore) continue;
      // Ensure cursor matches currentRevision
      if (res.currentRevision > after) {
        // Another pull needed if more changes arrived
        const check = await fetchRemoteChanges(after, 200);
        if (check.changes.length > 0) {
          hasMore = true;
          continue;
        }
      }
      hasMore = false;
    } catch (e) {
      console.warn(`[sync] pull failed at ${after}`, e);
      throw e;
    }
  }
  if (totalPulled > 0) console.log(`[sync] pull completed, total ${totalPulled}, now at ${after}`);
}

export async function syncCycle(): Promise<void> {
  if (syncInProgress && syncPromise) return syncPromise;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setState("offline");
    console.log(`[sync] offline — deferred`);
    return;
  }
  syncInProgress = true;
  setState("syncing");
  const promise = (async () => {
    try {
      // One-time legacy backfill for pre-sync data
      try {
        await runLegacyBackfill();
      } catch (e) {
        console.warn("[sync] legacy backfill failed", e);
      }
      // Push first
      await pushPhase();
      // Then pull
      await pullPhase();
      lastSyncAt = Date.now();
      await db.syncMeta.put({ key: "lastSuccessfulSyncAt", value: lastSyncAt });
      setState("synced");
      console.log(`[sync] completed at revision ${await getServerRevision()}`);
    } catch (e) {
      setState("error");
      console.warn(`[sync] cycle failed`, e);
    } finally {
      syncInProgress = false;
      syncPromise = null;
    }
  })();
  syncPromise = promise;
  return promise;
}

export function triggerSync(): void {
  // Debounce slightly, but trigger promptly after local mutation
  setTimeout(() => {
    syncCycle().catch(() => {});
  }, 500);
}

let hooksSetup = false;
let managerStarted = false;
let managerCleanup: (() => void) | null = null;

export function startSyncManager(): () => void {
  if (managerStarted && managerCleanup) return managerCleanup;
  managerStarted = true;
  if (!hooksSetup) {
    try {
      setupSyncHooks();
      hooksSetup = true;
    } catch (e) {
      console.warn("[sync] setup hooks failed", e);
    }
  }
  // Ensure clientId exists
  getOrCreateClientId().catch(() => {});

  // Startup sync after short delay to allow UI to load from IndexedDB
  setTimeout(() => {
    syncCycle().catch(() => {});
  }, 1500);

  // Online event
  const onOnline = () => {
    console.log(`[sync] online event`);
    syncCycle().catch(() => {});
  };
  const onFocus = () => {
    // Optionally sync on focus if enough time passed
    const now = Date.now();
    if (now - lastSyncAt > 10000) {
      syncCycle().catch(() => {});
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") onFocus();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
  }

  // Periodic while online ~20s
  periodicTimer = setInterval(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    syncCycle().catch(() => {});
  }, 20000);

  managerCleanup = () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    }
    if (periodicTimer) clearInterval(periodicTimer);
    managerStarted = false;
    managerCleanup = null;
  };
  return managerCleanup;
}

// For manual testing
export async function forceSync(): Promise<void> {
  return syncCycle();
}
