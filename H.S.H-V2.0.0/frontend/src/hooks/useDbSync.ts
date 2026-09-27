"use client";

import { useEffect, useRef } from "react";
import type { DependencyList } from "react";

export function useDbSync(callback: () => void | Promise<void>, _deps: DependencyList = []) {
  // Compatibility-only: retained so existing useDbSync(callback, [a, b]) call
  // sites keep compiling unchanged. Subscription freshness no longer depends on
  // re-subscribing, so these values are intentionally not used as effect deps.
  void _deps;

  // PBS-BUG-015: mirror the latest callback so the single stable listener below
  // always invokes current logic without teardown/re-add. Assigned in an effect
  // (not during render) to satisfy the project's refs-during-render lint rule;
  // React flushes passive effects before the next dispatched browser/task event,
  // so steady-state delivery is latest-callback. (Render-time assignment would
  // narrow the window marginally further but violates lint; churn elimination —
  // the deterministic defect — is identical either way.)
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const handler = () => {
      try {
        const res = callbackRef.current();
        if (res instanceof Promise) res.catch(() => {});
      } catch {}
    };
    window.addEventListener("hebrih-db-synced", handler);
    return () => {
      window.removeEventListener("hebrih-db-synced", handler);
    };
  }, []);
}
