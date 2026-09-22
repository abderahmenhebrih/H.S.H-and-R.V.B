"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function SyncInitializer() {
  const pathname = usePathname();
  const isRvb = pathname?.startsWith("/rvb");
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (isRvb) {
      if (cleanupRef.current) {
        try {
          cleanupRef.current();
        } catch {}
        cleanupRef.current = null;
      }
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const [managerMod, schedulerMod] = await Promise.all([
        import("./manager"),
        import("../task-notification-scheduler"),
      ]);
      if (cancelled) return;
      // Double-check route hasn't changed to /rvb while imports resolved
      if (typeof window !== "undefined" && window.location.pathname.startsWith("/rvb")) return;
      const stopSync = managerMod.startSyncManager();
      const stopTask = schedulerMod.startTaskNotificationScheduler();
      if (cancelled) {
        try {
          stopSync();
        } catch {}
        try {
          stopTask();
        } catch {}
        return;
      }
      cleanupRef.current = () => {
        try {
          stopSync();
        } catch {}
        try {
          stopTask();
        } catch {}
      };
    })();

    return () => {
      cancelled = true;
      try {
        cleanupRef.current?.();
      } catch {}
      cleanupRef.current = null;
    };
  }, [isRvb]);
  return null;
}
