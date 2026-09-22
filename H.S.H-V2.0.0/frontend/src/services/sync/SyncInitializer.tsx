"use client";

import { useEffect } from "react";
import { startSyncManager } from "./manager";
import { startTaskNotificationScheduler } from "../task-notification-scheduler";

export default function SyncInitializer() {
  useEffect(() => {
    const stopSync = startSyncManager();
    const stopTask = startTaskNotificationScheduler();
    return () => {
      try {
        stopSync();
      } catch {}
      try {
        stopTask();
      } catch {}
    };
  }, []);
  return null;
}
