"use client";

import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  value?: number | string;
  status?: string;
  language?: string;
};

export default function RvbKpiCard({ icon: Icon, title, value, status }: Props) {
  const display = value === undefined || value === null || value === "" ? "—" : String(value);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 18px",
        minHeight: 92,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "var(--panel)",
        boxShadow: "0 1px 6px var(--shadow)",
        boxSizing: "border-box",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 44,
          height: 44,
          flex: "0 0 44px",
          display: "grid",
          placeItems: "center",
          borderRadius: 10,
          background: "var(--accent-soft)",
          border: "1px solid var(--accent-ring)",
          color: "var(--accent)",
        }}
      >
        <Icon size={20} strokeWidth={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--muted)",
            lineHeight: 1.1,
          }}
        >
          {title}
        </span>
        <strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{display}</strong>
        {status && (
          <small style={{ fontSize: 11, color: "var(--subtle)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {status}
          </small>
        )}
      </div>
    </div>
  );
}
