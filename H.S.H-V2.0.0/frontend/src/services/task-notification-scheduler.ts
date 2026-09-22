"use client";

import { taskService } from "./task.service";
import { evaluateTaskNotifications } from "./notification-engine";

let interval: any = null;

export function startTaskNotificationScheduler() {
  const run = async () => {
    try {
      const tasks: any[] = await taskService.getAll();
      await evaluateTaskNotifications(tasks);
    } catch {}
  };
  // Run on startup after 5s
  setTimeout(run, 5000);
  // Run every 45 minutes
  if (interval) clearInterval(interval);
  interval = setInterval(run, 45 * 60 * 1000);
  // Also run after task changes via event
  const handler = () => {
    setTimeout(run, 1000);
  };
  if (typeof window !== "undefined") {
    window.addEventListener("hebrih-db-synced", handler as any);
  }
  return () => {
    if (interval) clearInterval(interval);
    if (typeof window !== "undefined") {
      window.removeEventListener("hebrih-db-synced", handler as any);
    }
  };
}
