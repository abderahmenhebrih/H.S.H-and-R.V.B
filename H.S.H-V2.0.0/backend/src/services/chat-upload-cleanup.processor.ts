import { deleteOrphanChatUploads } from "./chat-upload.service";

// Periodic orphan cleanup for chat media uploads (pending rows past expiry).
// Follows the rvb-chat-reminder processor pattern: module-level start/stop,
// disabled in tests, first tick delayed, never blocks startup.

let intervalHandle: NodeJS.Timeout | null = null;
let running = false;

const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

function isDisabled(): boolean {
  if (process.env.NODE_ENV === "test" || process.env.RVB_TEST_MODE === "true") return true;
  if (process.env.DISABLE_CHAT_UPLOAD_CLEANUP === "1") return true;
  return false;
}

function intervalMs(): number {
  const raw = Number(process.env.CHAT_UPLOAD_CLEANUP_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 60 * 1000) return Math.floor(raw);
  return DEFAULT_INTERVAL_MS;
}

export async function runChatUploadCleanupOnce(limit = 100): Promise<{ rows: number; blobs: number }> {
  return deleteOrphanChatUploads(limit);
}

export function startChatUploadCleanupProcessor(): void {
  if (isDisabled()) {
    // eslint-disable-next-line no-console
    console.log("[chat-upload-cleanup] disabled (test mode or DISABLE_CHAT_UPLOAD_CLEANUP=1)");
    return;
  }
  if (intervalHandle) return;
  const ms = intervalMs();
  const tick = async () => {
    // Overlap protection: a slow Cloudinary pass never stacks another run.
    if (running) return;
    running = true;
    try {
      const { rows, blobs } = await deleteOrphanChatUploads(100);
      if (rows > 0 || blobs > 0) {
        // eslint-disable-next-line no-console
        console.log(`[chat-upload-cleanup] removed ${rows} orphan rows, ${blobs} blobs`);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[chat-upload-cleanup] tick error", (e as any)?.message);
    } finally {
      running = false;
    }
  };
  // Delayed first tick: never blocks startup, avoids boot thundering herd.
  const first = setTimeout(tick, 5 * 60 * 1000);
  first.unref?.();
  intervalHandle = setInterval(tick, ms);
  intervalHandle.unref?.();
  // eslint-disable-next-line no-console
  console.log("[chat-upload-cleanup] started, interval", ms);
}

export function stopChatUploadCleanupProcessor(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
