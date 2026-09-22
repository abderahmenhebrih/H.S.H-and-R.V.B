"use client";

import { useEffect } from "react";

export function useDbSync(callback: () => void | Promise<void>, deps: any[] = []) {
  useEffect(() => {
    const handler = () => {
      try {
        const res = callback();
        if (res instanceof Promise) res.catch(() => {});
      } catch {}
    };
    window.addEventListener("hebrih-db-synced", handler);
    return () => {
      window.removeEventListener("hebrih-db-synced", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
