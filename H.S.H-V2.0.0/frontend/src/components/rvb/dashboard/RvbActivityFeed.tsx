"use client";

import { Activity } from "lucide-react";

type Props = {
  language: "en" | "fr" | "ar";
  title: string;
  emptyTitle: string;
  emptyDesc: string;
};

export default function RvbActivityFeed({ title, emptyTitle, emptyDesc }: Props) {
  return (
    <div
      style={{
        padding: 18,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "var(--panel)",
        boxShadow: "0 1px 6px var(--shadow)",
        minHeight: 280,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 10, padding: "24px 12px" }}>
        <span
          aria-hidden="true"
          style={{
            width: 46,
            height: 46,
            display: "grid",
            placeItems: "center",
            borderRadius: 11,
            background: "var(--panel-hover)",
            border: "1px solid var(--border)",
            color: "var(--muted)",
          }}
        >
          <Activity size={22} strokeWidth={2} />
        </span>
        <strong style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{emptyTitle}</strong>
        <p style={{ margin: 0, fontSize: 11, color: "var(--muted)", lineHeight: 1.5, maxWidth: 360 }}>{emptyDesc}</p>
      </div>
    </div>
  );
}
