"use client";

import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  role: string;
  activeLabel?: string;
  archivedLabel?: string;
  activeValue?: string | number;
  archivedValue?: string | number;
};

export default function RvbRoleOverviewCard({ icon: Icon, role, activeLabel = "Active", archivedLabel = "Archived", activeValue = "—", archivedValue = "—" }: Props) {
  return (
    <div
      style={{
        padding: 16,
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--panel)",
        boxShadow: "0 1px 6px var(--shadow)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            display: "grid",
            placeItems: "center",
            borderRadius: 9,
            background: "var(--accent-soft)",
            border: "1px solid var(--accent-ring)",
            color: "var(--accent)",
            flex: "0 0 36px",
          }}
        >
          <Icon size={18} strokeWidth={2} />
        </span>
        <strong style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{role}</strong>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: 10,
          width: "100%",
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0, width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--panel-hover)", border: "1px solid var(--border)", boxSizing: "border-box" }}>
          <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{activeLabel}</span>
          <strong style={{ display: "block", marginTop: 2, fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{String(activeValue)}</strong>
        </div>
        <div style={{ minWidth: 0, width: "100%", padding: "8px 10px", borderRadius: 8, background: "var(--panel-hover)", border: "1px solid var(--border)", boxSizing: "border-box" }}>
          <span style={{ display: "block", fontSize: 10, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{archivedLabel}</span>
          <strong style={{ display: "block", marginTop: 2, fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{String(archivedValue)}</strong>
        </div>
      </div>
    </div>
  );
}
