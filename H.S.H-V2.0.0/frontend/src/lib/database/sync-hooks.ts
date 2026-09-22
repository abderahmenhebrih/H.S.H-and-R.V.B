import type { SyncEntity } from "@/src/types/sync/sync";

let applyingRemote = false;

export function isApplyingRemote(): boolean {
  return applyingRemote;
}

export async function runAsRemote<T>(fn: () => Promise<T>): Promise<T> {
  const prev = applyingRemote;
  applyingRemote = true;
  try {
    return await fn();
  } finally {
    applyingRemote = prev;
  }
}

// Dexie hooks are no longer used for outbound queue creation.
// Outbound sync is now handled exclusively via BaseRepository transactional methods
// (createLocal/updateLocal/deleteLocal) to ensure atomic entity + queue commits.
// This hook file now only provides the runAsRemote flag for remote applies.

export function setupSyncHooks() {
  // No-op: hooks removed for transaction safety. Kept for backward compatibility.
}
