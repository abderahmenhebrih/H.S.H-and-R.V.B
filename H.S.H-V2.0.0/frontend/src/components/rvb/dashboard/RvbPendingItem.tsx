"use client";

import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  count?: string | number;
  description: string;
  href: string;
  viewLabel: string;
};

export default function RvbPendingItem({ icon: Icon, title, count = "—", description, href, viewLabel }: Props) {
  const router = useRouter();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--panel)",
        boxShadow: "0 1px 6px var(--shadow)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 38,
          height: 38,
          flex: "0 0 38px",
          display: "grid",
          placeItems: "center",
          borderRadius: 9,
          background: "var(--panel-hover)",
          border: "1px solid var(--border)",
          color: "var(--accent)",
        }}
      >
        <Icon size={18} strokeWidth={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <strong style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</strong>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--subtle)" }}>{String(count)}</span>
        </div>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--muted)", lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{description}</p>
      </div>
      <button
        type="button"
        onClick={() => router.push(href)}
        aria-label={viewLabel}
        style={{
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--panel)",
          color: "var(--text)",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {viewLabel}
        <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  );
}
