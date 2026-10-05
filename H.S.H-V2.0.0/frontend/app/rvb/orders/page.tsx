"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import RvbShell from "../../../src/components/rvb/RvbShell";
import StyledSelect from "../../../src/components/common/StyledSelect";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { customerOrderService, type CustomerOrder } from "../../../src/services/customer-order.service";
import { rvbConfigService } from "../../../src/services/rvb-config.service";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { RvbOrdersGuard } from "../../../src/components/rvb/RvbRoleGuard";
import { Search, ShoppingCart, Eye, X } from "lucide-react";
import { formatCurrency } from "../../../src/lib/settings";
import { exactNumberLabel, formatCompactNumber } from "../../../src/lib/compact-number";
import styles from "./page.module.css";

const TR: Record<string, any> = {
  en: { title: "Orders", subtitle: "Review and manage customer orders.", searchPlaceholder: "Search by customer, order ID or @tag", all: "All", underReview: "Under Review", accepted: "Accepted", rejected: "Rejected", cancelled: "Cancelled", view: "Access", noOrders: "No orders found.", emptyFiltered: "No orders match the selected status filter.", total: "Total Orders", pending: "Under Review", acceptedKpi: "Accepted", rejectedKpi: "Rejected" },
  fr: { title: "Commandes", subtitle: "Consulter et gérer les commandes clients.", searchPlaceholder: "Rechercher par client, commande ou @tag", all: "Tous", underReview: "En Examen", accepted: "Acceptée", rejected: "Rejetée", cancelled: "Annulée", view: "Accéder", noOrders: "Aucune commande trouvée.", emptyFiltered: "Aucune commande ne correspond au filtre.", total: "Total Commandes", pending: "En Examen", acceptedKpi: "Acceptées", rejectedKpi: "Rejetées" },
  ar: { title: "الطلبات", subtitle: "مراجعة وإدارة طلبات الزبائن.", searchPlaceholder: "ابحث بالزبون أو الطلب أو @tag", all: "الكل", underReview: "قيد المراجعة", accepted: "مقبولة", rejected: "مرفوضة", cancelled: "ملغاة", view: "دخول", noOrders: "لا توجد طلبات.", emptyFiltered: "لا توجد طلبات مطابقة للفلتر.", total: "إجمالي الطلبات", pending: "قيد المراجعة", acceptedKpi: "مقبولة", rejectedKpi: "مرفوضة" },
};

function OrdersInner() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("under_review");
  const [selected, setSelected] = useState<any | null>(null);

  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const o = await customerOrderService.list(statusFilter ? { status: statusFilter } : {}).catch(() => [] as any[]);
      setOrders(Array.isArray(o) ? o : []);
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => {
    rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); });
    rvbConfigService.get().then((c) => { if (c?.currency) setSettings((prev:any)=>({...prev, currency:c.currency})); }).catch(()=>{});
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
      else rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); });
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h);
    return () => window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o: any) => {
      const hay = `${o.id} ${o.customerName || ""} ${o.customerId || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, search]);

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
    // hideHeader (same mechanism as /rvb/accounts, /rvb/workers and
    // /rvb/directory): this page renders its own command card, so the shared
    // CompactHeader would duplicate it.
    <RvbShell activePage="orders" hideHeader>
      <div className={styles.rvbAccountsRoot} dir={lang === "ar" ? "rtl" : "ltr"}>
        {/* Unified command card (Accounts & Access proportions): brand +
            integrated search. No primary CTA — orders are created by
            customers, not management. Replaces the old duplicate title +
            separate search toolbar — same search state/behavior, new
            composition. */}
        <div className={styles.commandCard}>
          <div className={styles.commandBrand}>
            <div className={styles.commandLogo}>
              <img src="/chicken.jpg" alt="" />
            </div>
            <div className={styles.commandTitle}>
              <h1>{t.title}</h1>
              <span>{t.subtitle}</span>
            </div>
          </div>
          <div className={styles.searchBox}>
            <Search size={20} strokeWidth={2} aria-hidden="true" className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              aria-label={t.searchPlaceholder}
            />
          </div>
        </div>

        <div className={styles.kpiRow}>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "var(--accent-soft)", border: "1px solid var(--accent-ring)", color: "var(--accent)", flex: "0 0 44px" }}><ShoppingCart size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.total}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }} title={loading ? undefined : exactNumberLabel(kpi.total)}>{loading ? "—" : formatCompactNumber(kpi.total)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(175,149,75,0.11)", border: "1px solid rgba(175,149,75,0.16)", color: "#8a6d1b", flex: "0 0 44px" }}><ShoppingCart size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.pending}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }} title={loading ? undefined : exactNumberLabel(kpi.pending)}>{loading ? "—" : formatCompactNumber(kpi.pending)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(58,125,82,0.10)", border: "1px solid rgba(58,125,82,0.18)", color: "#3A7D52", flex: "0 0 44px" }}><ShoppingCart size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.acceptedKpi}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }} title={loading ? undefined : exactNumberLabel(kpi.accepted)}>{loading ? "—" : formatCompactNumber(kpi.accepted)}</strong></div>
          </div>
          <div className={styles.card} style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, minHeight: 92 }}>
            <div style={{ width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 10, background: "rgba(185,58,66,0.09)", border: "1px solid rgba(185,58,66,0.12)", color: "#C0392B", flex: "0 0 44px" }}><ShoppingCart size={20} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--muted)" }}>{t.rejectedKpi}</span><strong style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }} title={loading ? undefined : exactNumberLabel(kpi.rejected)}>{loading ? "—" : formatCompactNumber(kpi.rejected)}</strong></div>
          </div>
        </div>

        {/* Filter toolbar — status dropdown only (search moved into the
            command card above). */}
        <div className={styles.toolbar}>
          <div className={styles.filterGroup}>
            <div className={styles.filterSelect}>
              <StyledSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "", label: t.all },
                  { value: "under_review", label: t.underReview },
                  { value: "accepted", label: t.accepted },
                  { value: "rejected", label: t.rejected },
                  { value: "cancelled", label: t.cancelled },
                ]}
                placeholder={t.all}
                ariaLabel={t.underReview}
              />
            </div>
          </div>
        </div>

        <div className={styles.card}>
          {loading ? (
            <div className={styles.loadingBox}><div className={styles.loadingPulse} /><strong style={{ fontSize: 13, color: "var(--muted)" }}>Loading...</strong></div>
          ) : filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon} aria-hidden="true"><ShoppingCart size={26} /></div>
              <h3 className={styles.emptyTitle}>{t.noOrders}</h3>
              {statusFilter ? <p className={styles.emptyDesc}>{t.emptyFiltered}</p> : null}
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
                  {filtered.map((o: any) => {
                    return (
                      <tr key={o.id}>
                        <td><span style={{ fontWeight: 700, fontSize: 12 }}>{o.customerName || o.customerId.slice(0,8)}</span>{o.customerName && <small dir="ltr" style={{ display: "block", color: "var(--muted)", fontSize: 11 }}>{o.customerId.slice(0,8)}</small>}</td>
                        <td><span style={{ fontFamily: "ui-monospace", fontSize: 11, color: "var(--muted)" }}>{o.id.slice(0,12)}…</span></td>
                        <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 12 }}>{formatCurrency(o.total, settings.currency as any)}</td>
                        <td><span className={`${styles.badge} ${o.status === "under_review" ? styles.badgeOnboardingPending : o.status === "accepted" ? styles.badgeStatusActive : o.status === "rejected" ? styles.badgeStatusDisabled : styles.badgeStatusArchived}`}>{o.status}</span></td>
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
                  <div className={styles.detailRow}><span className={styles.detailLabel}>Customer</span><span className={styles.detailValue}>{selected.customerName || selected.customerId}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>Total</span><span className={styles.detailValue}>{formatCurrency(selected.total, settings.currency as any)}</span></div>
                  <div className={styles.detailRow}><span className={styles.detailLabel}>Status</span><span className={`${styles.badge} ${selected.status === "under_review" ? styles.badgeOnboardingPending : selected.status === "accepted" ? styles.badgeStatusActive : selected.status === "rejected" ? styles.badgeStatusDisabled : styles.badgeStatusArchived}`}>{selected.status}</span></div>
                </div>
              </div>
              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Items</h3>
                {(selected.items || []).map((it: any, idx: number) => (
                  <div key={idx} className={styles.detailRow}>
                    <span className={styles.detailLabel}>{it.productId.slice(0,8)} · {it.quantity} × {it.weightKg}kg</span>
                    <span className={styles.detailValue}>{formatCurrency(it.total, settings.currency as any)}</span>
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

