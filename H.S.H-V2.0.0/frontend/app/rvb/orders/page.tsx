"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { customerOrderService, type CustomerOrder } from "../../../src/services/customer-order.service";
import { customerService } from "../../../src/services/customer.service";
import type { Customer } from "../../../src/types/entities/customer";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { RvbOrdersGuard } from "../../../src/components/rvb/RvbRoleGuard";
import { Search, ShoppingCart, Eye, X } from "lucide-react";
import { formatCurrency } from "../../../src/lib/settings";
import styles from "./page.module.css";

const TR: Record<string, any> = {
  en: { title: "Orders", subtitle: "Review and manage customer orders.", searchPlaceholder: "Search by customer, order ID or @tag", all: "All", underReview: "Under Review", accepted: "Accepted", rejected: "Rejected", cancelled: "Cancelled", view: "Access", noOrders: "No orders found.", total: "Total Orders", pending: "Under Review", acceptedKpi: "Accepted", rejectedKpi: "Rejected" },
  fr: { title: "Commandes", subtitle: "Consulter et gérer les commandes clients.", searchPlaceholder: "Rechercher par client, commande ou @tag", all: "Tous", underReview: "En Examen", accepted: "Acceptée", rejected: "Rejetée", cancelled: "Annulée", view: "Accéder", noOrders: "Aucune commande trouvée.", total: "Total Commandes", pending: "En Examen", acceptedKpi: "Acceptées", rejectedKpi: "Rejetées" },
  ar: { title: "الطلبات", subtitle: "مراجعة وإدارة طلبات الزبائن.", searchPlaceholder: "ابحث بالزبون أو الطلب أو @tag", all: "الكل", underReview: "قيد المراجعة", accepted: "مقبولة", rejected: "مرفوضة", cancelled: "ملغاة", view: "دخول", noOrders: "لا توجد طلبات.", total: "إجمالي الطلبات", pending: "قيد المراجعة", acceptedKpi: "مقبولة", rejectedKpi: "مرفوضة" },
};

function OrdersInner() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("under_review");
  const [selected, setSelected] = useState<CustomerOrder | null>(null);

  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, c] = await Promise.all([
        customerOrderService.list(statusFilter ? { status: statusFilter } : {}).catch(() => [] as CustomerOrder[]),
        customerService.getAll().catch(() => [] as Customer[]),
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setCustomers(Array.isArray(c) ? c : []);
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => {
    settingsService.get().then((s) => { if (s) setSettings(s); });
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
      else settingsService.get().then((s) => { if (s) setSettings(s); });
    };
    window.addEventListener(SETTINGS_EVENT, h);
    return () => window.removeEventListener(SETTINGS_EVENT, h);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const customerMap = useMemo(() => {
    const m = new Map<string, Customer>();
    for (const c of customers) m.set(c.id, c);
    return m;
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const c = customerMap.get(o.customerId);
      const hay = `${o.id} ${c?.name || ""} ${c?.phone || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, search, customerMap]);

  const kpi = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === "under_review").length;
    const accepted = orders.filter((o) => o.status === "accepted").length;
    const rejected = orders.filter((o) => o.status === "rejected").length;
    return { total, pending, accepted, rejected };
  }, [orders]);

  const handleReview = async (id: string, status: "accepted" | "rejected") => {
    try {
      await customerOrderService.review(id, status);
      await load();
      setSelected(null);
    } catch (e: any) { alert(e?.message || "Review failed"); }
  };

  return (
    <RvbShell activePage="orders">
      <div className={styles.rvbAccountsRoot} dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className={styles.headerWrap}>
          <h1 className={styles.headerTitle}>{t.title}</h1>
          <p className={styles.headerSubtitle}>{t.subtitle}</p>
        </div>

        <div className={styles.kpiRow}>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", color: "var(--accent)", flex: "0 0 44px" }}><ShoppingCart size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.total}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.total)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(175,149,75,0.11)", border: "1px solid rgba(175,149,75,0.16)", color: "#8a6d1b", flex: "0 0 44px" }}><ShoppingCart size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.pending}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.pending)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(58,125,82,0.10)", border: "1px solid rgba(58,125,82,0.18)", color: "#3A7D52", flex: "0 0 44px" }}><ShoppingCart size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.acceptedKpi}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.accepted)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(120,120,130,0.10)", border: "1px solid rgba(120,120,130,0.18)", color: "var(--muted)", flex: "0 0 44px" }}><ShoppingCart size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.rejectedKpi}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{loading ? "—" : String(kpi.rejected)}</strong></div>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <span aria-hidden="true"><Search size={18} /></span>
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder} />
          </div>
          <div className={styles.filterGroup}>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minHeight: 44, padding: "0 14px", border: "1px solid var(--border)", borderRadius: 11, background: "var(--panel)", color: "var(--text)", fontWeight: 600, fontSize: 13 }}>
              <option value="">{t.all}</option>
              <option value="under_review">{t.underReview}</option>
              <option value="accepted">{t.accepted}</option>
              <option value="rejected">{t.rejected}</option>
              <option value="cancelled">{t.cancelled}</option>
            </select>
          </div>
        </div>

        <div className={styles.card}>
          {loading ? (
            <div className={styles.loadingBox}><div className={styles.loadingPulse} /><strong style={{ fontSize: 13, color: "var(--muted)" }}>Loading...</strong></div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true"><ShoppingCart size={26} /></div>
              <h3 className={styles.emptyTitle}>{t.noOrders}</h3>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table} role="table" aria-label={t.title}>
                <thead className={styles.tableHead}>
                  <tr>
                    <th style={{ width: "25%" }}>Customer</th>
                    <th style={{ width: "25%" }}>Order ID</th>
                    <th style={{ width: "15%" }}>Total</th>
                    <th style={{ width: "15%" }}>Status</th>
                    <th style={{ width: "20%", textAlign: "center" }}>Actions</th>
                  </tr>
                </thead>
                <tbody className={styles.tableBody}>
                  {filtered.map((o) => {
                    const c = customerMap.get(o.customerId);
                    return (
                      <tr key={o.id}>
                        <td><span style={{ fontWeight: 700, fontSize: 12 }}>{c?.name || o.customerId.slice(0,8)}</span>{c && <small dir="ltr" style={{ display: "block", color: "var(--muted)", fontSize: 11 }}>{c.phone}</small>}</td>
                        <td><span style={{ fontFamily: "ui-monospace", fontSize: 11, color: "var(--muted)" }}>{o.id.slice(0,12)}…</span></td>
                        <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 12 }}>{formatCurrency(o.total, "DA" as any)}</td>
                        <td><span className={`${styles.badge} ${o.status === "under_review" ? styles.badgeOnboardingPending : o.status === "accepted" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>{o.status}</span></td>
                        <td>
                          <div className={styles.actionsCell} style={{ justifyContent: "center" }}>
                            <button type="button" className={styles.viewButton} onClick={() => setSelected(o)}><Eye size={14} />{t.view}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className={styles.drawerBackdrop} onClick={() => setSelected(null)}>
          <section className={styles.drawer} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100vw)" }}>
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>Order {selected.id.slice(0,8)}</h2>
              <button type="button" className={styles.closeButton} onClick={() => setSelected(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Details</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>Customer</span><span className={styles.detailValue}>{customerMap.get(selected.customerId)?.name || selected.customerId}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>Total</span><span className={styles.detailValue}>{formatCurrency(selected.total, "DA" as any)}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>Status</span><span className={`${styles.badge} ${selected.status === "under_review" ? styles.badgeOnboardingPending : selected.status === "accepted" ? styles.badgeStatusActive : styles.badgeStatusArchived}`}>{selected.status}</span></div>
                </div>
              </div>
              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Items</h3>
                {(selected.items || []).map((it: any, idx: number) => (
                  <div key={idx} className={styles.detailRow}>
                    <span className={styles.detailLabel}>{it.productId.slice(0,8)} · {it.quantity} × {it.weightKg}kg</span>
                    <span className={styles.detailValue}>{formatCurrency(it.total, "DA" as any)}</span>
                  </div>
                ))}
              </div>
              {selected.status === "under_review" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className={styles.primaryButton} onClick={() => handleReview(selected.id, "accepted")} style={{ flex: 1, background: "#3A7D52", borderColor: "#3A7D52" }}>Accept</button>
                  <button type="button" className={styles.secondaryButton} onClick={() => handleReview(selected.id, "rejected")} style={{ flex: 1 }}>Reject</button>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </RvbShell>
  );
}

export default function RvbOrdersPage() {
  return (
    <RvbAuthGuard>
      <RvbOrdersGuard>
        <OrdersInner />
      </RvbOrdersGuard>
    </RvbAuthGuard>
  );
}
