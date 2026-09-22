"use client";

import { CheckCircle2, Clock3 } from "lucide-react";

type StatusItem = {
  label: string;
  status: string;
  ready: boolean;
};

type Props = {
  title: string;
  items: StatusItem[];
};

export default function RvbSystemStatus({ title, items }: Props) {
  return (
    <div
      style={{
        padding: 18,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "var(--panel)",
        boxShadow: "0 1px 6px var(--shadow)",
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it) => (
          <div
            key={it.label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--panel-hover)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{it.label}</span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                borderRadius: 999,
                background: it.ready ? "rgba(58,125,82,0.10)" : "var(--accent-soft)",
                border: `1px solid ${it.ready ? "rgba(58,125,82,0.16)" : "var(--accent-ring)"}`,
                color: it.ready ? "#3A7D52" : "var(--accent)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {it.ready ? <CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" /> : <Clock3 size={12} strokeWidth={2} aria-hidden="true" />}
              {it.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
