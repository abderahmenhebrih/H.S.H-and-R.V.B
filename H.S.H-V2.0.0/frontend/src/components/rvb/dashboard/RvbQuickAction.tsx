"use client";

import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

type Props = {
  icon: LucideIcon;
  label: string;
  href: string;
};

export default function RvbQuickAction({ icon: Icon, label, href }: Props) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--panel)",
        color: "var(--text)",
        textAlign: "start",
        cursor: "pointer",
        boxShadow: "0 1px 6px var(--shadow)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          flex: "0 0 36px",
          display: "grid",
          placeItems: "center",
          borderRadius: 9,
          background: "var(--accent-soft)",
          border: "1px solid var(--accent-ring)",
          color: "var(--accent)",
        }}
      >
        <Icon size={18} strokeWidth={2} />
      </span>
      <strong style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</strong>
      <span aria-hidden="true" style={{ color: "var(--muted)" }}>
        <ArrowRight size={14} strokeWidth={2} />
      </span>
    </button>
  );
}
