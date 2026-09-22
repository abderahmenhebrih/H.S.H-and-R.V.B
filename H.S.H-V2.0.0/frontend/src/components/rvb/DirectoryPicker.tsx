"use client";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { rvbDirectoryService, type DirectoryItem } from "../../services/rvb-directory.service";

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Props = {
  selectedIds: string[];
  onToggle: (id: string) => void;
  excludeIds?: string[];
};

export default function DirectoryPicker({ selectedIds, onToggle, excludeIds }: Props) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState("all");
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 320);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await rvbDirectoryService.list({ q: debounced || undefined, role: role !== "all" ? role : undefined, limit: 50 });
        if (!cancelled) {
          const filtered = excludeIds ? res.items.filter((it) => !excludeIds.includes(it.id)) : res.items;
          setItems(filtered);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [debounced, role, excludeIds]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-hover)" }}>
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, @tag or role" style={{ flex: 1, border: 0, outline: 0, background: "transparent", fontSize: 13 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {["all", "worker", "supplier", "customer", "supervisor", "management"].map((r) => (
          <button key={r} type="button" onClick={() => setRole(r)} style={{ minHeight: 28, padding: "0 10px", borderRadius: 999, border: "1px solid var(--border)", background: role === r ? "var(--accent)" : "var(--panel)", color: role === r ? "#fff" : "var(--text)", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer" }}>
            {r === "all" ? "All" : r === "management" ? "Management" : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel)" }}>
        {loading ? (
          <div style={{ padding: 14, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 14, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>No accounts found</div>
        ) : (
          items.map((a) => {
            const isSelected = selectedIds.includes(a.id);
            return (
              <label key={a.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderBottom: "1px solid var(--border)", cursor: "pointer", background: isSelected ? "var(--accent-soft)" : undefined }}>
                <input type="checkbox" checked={isSelected} onChange={() => onToggle(a.id)} />
                <span style={{ width: 32, height: 32, flex: "0 0 32px", display: "grid", placeItems: "center", borderRadius: 8, background: "var(--panel-hover)", border: "1px solid var(--border)", color: "var(--muted)", fontWeight: 800, fontSize: 11, overflow: "hidden" }}>
                  {a.profilePicture ? <img src={a.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(a.displayName)}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.displayName}</strong>
                  <small dir="ltr" style={{ fontSize: 11, color: "var(--muted)" }}>@{a.tag} · {a.role}</small>
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
