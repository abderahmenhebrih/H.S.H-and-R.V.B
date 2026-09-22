"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";

type BellProps = { language?: string; dark?: boolean };

export default function NotificationBell(props: BellProps) {
  const [BellComp, setBellComp] = useState<ComponentType<BellProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const isRvb = typeof window !== "undefined" && window.location.pathname.startsWith("/rvb");
    const load = async () => {
      try {
        if (isRvb) {
          const mod = await import("./RvbNotificationBell");
          if (!cancelled) setBellComp(() => mod.default);
        } else {
          const mod = await import("./HshNotificationBell");
          if (!cancelled) setBellComp(() => mod.default);
        }
      } catch {}
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (BellComp) return <BellComp {...props} />;
  // Lightweight placeholder while dynamic bell loads - matches bellButton size to avoid layout shift
  return (
    <div style={{ width: 48, height: 48, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: 11, background: "var(--panel)" }} aria-hidden="true" />
  );
}
