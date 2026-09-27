"use client";

import { useEffect, useEffectEvent } from "react";
import type { DependencyList } from "react";

export function useDbSync(callback: () => void | Promise<void>, _deps: DependencyList = []) {
  // Compatibility-only: retained so existing useDbSync(callback, [a, b]) call
  // sites keep compiling unchanged. Subscription freshness no longer depends on
  // re-subscribing, so these values are intentionally not used as effect deps.
  void _deps;

  // PBS-BUG-015 correction 1: Effect Event always invokes the latest COMMITTED
  // callback — no passive-effect mirror lag. The stable browser listener below
  // therefore delivers current-commit logic with zero teardown/re-add, closing
  // both the churn and the commit-to-passive stale window. Async/error semantics
  // are byte-identical to the previous handler (try/catch + swallowed rejections).
  const onDbSync = useEffectEvent(() => {
    try {
      const res = callback();
      if (res instanceof Promise) res.catch(() => {});
    } catch {}
  });

  useEffect(() => {
    const handler = () => {
      onDbSync();
    };
    window.addEventListener("hebrih-db-synced", handler);
    return () => {
      window.removeEventListener("hebrih-db-synced", handler);
    };
  }, []);
}
