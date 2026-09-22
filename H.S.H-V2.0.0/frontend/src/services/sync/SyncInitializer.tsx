"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { startSyncManager } from "./manager";
import { startTaskNotificationScheduler } from "../task-notification-scheduler";

export default function SyncInitializer() {
  const pathname = usePathname();
  const isRvb = pathname?.startsWith("/rvb");
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isRvb) {
      if (cleanupRef.current) {
        try {
          cleanupRef.current();
        } catch {}
        cleanupRef.current = null;
      }
      return;
    }
    const stopSync = startSyncManager();
    const stopTask = startTaskNotificationScheduler();
    cleanupRef.current = () => {
      try {
        stopSync();
      } catch {}
      try {
        stopTask();
      } catch {}
    };
    return () => {
      try {
        cleanupRef.current?.();
      } catch {}
      cleanupRef.current = null;
    };
  }, [isRvb]);
  return null;
}
