"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RvbShell from "../../../src/components/rvb/RvbShell";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { rvbDirectoryService, type DirectoryItem } from "../../../src/services/rvb-directory.service";
import { chatService } from "../../../src/services/chat.service";
import { Search, MessageSquare, User, ExternalLink, X, Users, Truck, UsersRound, ShieldCheck } from "lucide-react";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    title: "Directory",
    subtitle: "Find people and accounts by name, @tag or role.",
    searchPlaceholder: "Search by name, @tag or role",
    all: "All",
    workers: "Workers",
    supervisors: "Supervisors",
    suppliers: "Suppliers",
    customers: "Customers",
    management: "Management",
    message: "Message",
    profile: "Profile",
    openWorkspace: "Open in Workspace",
    noAccounts: "No accounts found.",
    noMatch: "No accounts match your search.",
    noWorkers: "No Workers found.",
    noSuppliers: "No Suppliers found.",
    noCustomers: "No Customers found.",
    loading: "Loading directory…",
    loadMore: "Load more",
    retry: "Retry",
    errorLoad: "Failed to load directory",
    self: "You",
    roleLabels: {
      manager: "Manager",
      admin: "Admin",
      supervisor: "Supervisor",
      worker: "Worker",
      supplier: "Supplier",
      customer: "Customer",
    },
  },
  fr: {
    title: "Annuaire",
    subtitle: "Rechercher des personnes et des comptes par nom, @tag ou rôle.",
    searchPlaceholder: "Rechercher par nom, @tag ou rôle",
    all: "Tous",
    workers: "Travailleurs",
    supervisors: "Superviseurs",
    suppliers: "Fournisseurs",
    customers: "Clients",
    management: "Direction",
    message: "Message",
    profile: "Profil",
    openWorkspace: "Ouvrir dans l’espace de gestion",
    noAccounts: "Aucun compte trouvé.",
    noMatch: "Aucun compte ne correspond à votre recherche.",
    noWorkers: "Aucun Travailleur trouvé.",
    noSuppliers: "Aucun Fournisseur trouvé.",
    noCustomers: "Aucun Client trouvé.",
    loading: "Chargement…",
    loadMore: "Charger plus",
    retry: "Réessayer",
    errorLoad: "Échec du chargement",
    self: "Vous",
    roleLabels: {
      manager: "Manager",
      admin: "Admin",
      supervisor: "Superviseur",
      worker: "Travailleur",
      supplier: "Fournisseur",
      customer: "Client",
    },
  },
  ar: {
    title: "الدليل",
    subtitle: "ابحث عن الأشخاص والحسابات بالاسم أو @الوسم أو الدور.",
    searchPlaceholder: "البحث بالاسم أو @الوسm أو الدور",
    all: "الكل",
    workers: "العمال",
    supervisors: "المشرفون",
    suppliers: "الموردون",
    customers: "الزبائن",
    management: "الإدارة",
    message: "رسالة",
    profile: "الملف الشخصي",
    openWorkspace: "فتح في مساحة الإدارة",
    noAccounts: "لم يتم العثور على حسابات.",
    noMatch: "لا توجد حسابات مطابقة للبحث.",
    noWorkers: "لا يوجد عمال.",
    noSuppliers: "لا يوجد موردون.",
    noCustomers: "لا يوجد زبائن.",
    loading: "جارٍ التحميل…",
    loadMore: "تحميل المزيد",
    retry: "إعادة",
    errorLoad: "فشل التحميل",
    self: "أنت",
    roleLabels: {
      manager: "مدير",
      admin: "مسؤول",
      supervisor: "مشرف",
      worker: "عامل",
      supplier: "مورد",
      customer: "زبون",
    },
  },
};

function initials(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const ROLE_FILTERS = [
  { key: "all", labelKey: "all" },
  { key: "worker", labelKey: "workers" },
  { key: "supervisor", labelKey: "supervisors" },
  { key: "supplier", labelKey: "suppliers" },
  { key: "customer", labelKey: "customers" },
  { key: "management", labelKey: "management" },
] as const;

function DirectoryInner() {
  const router = useRouter();
  const { user } = useRvbAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;
  const isRtl = lang === "ar";
  const myId = (user as any)?.accountId || (user as any)?.id || "";

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [role, setRole] = useState<string>("all");
  const [items, setItems] = useState<DirectoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<DirectoryItem | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState<string | null>(null);

  useEffect(() => {
    settingsService.get().then((s) => { if (s) setSettings(s); });
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
    };
    window.addEventListener(SETTINGS_EVENT, h as any);
    return () => window.removeEventListener(SETTINGS_EVENT, h as any);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 320);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async (reset: boolean, p: number) => {
    setLoading(true);
    setError("");
    const targetPage = reset ? 1 : p;
    try {
      const res = await rvbDirectoryService.list({ q: debounced || undefined, role: role !== "all" ? role : undefined, page: targetPage, limit: 24 });
      if (reset) {
        setItems(res.items);
      } else {
        setItems((prev) => [...prev, ...res.items]);
      }
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setPage(targetPage);
    } catch (e: any) {
      setError(e?.data?.code || e?.message || t.errorLoad);
    } finally { setLoading(false); }
  }, [debounced, role, t.errorLoad]);

  useEffect(() => {
    void load(true, 1);
  }, [debounced, role]);

  const handleSearchRole = (r: string) => {
    setRole(r);
    setPage(1);
  };

  const handleOpenProfile = async (item: DirectoryItem) => {
    setProfile(item);
    // Optionally fetch fresh safe profile
    try {
      setProfileLoading(true);
      const fresh = await rvbDirectoryService.getProfile(item.id);
      setProfile(fresh as any);
    } catch { /* keep item */ }
    finally { setProfileLoading(false); }
  };

  const handleMessage = async (targetId: string) => {
    if (targetId === myId) return;
    setMsgLoading(targetId);
    try {
      const conv = await chatService.createDM(targetId);
      router.push(`/rvb/chats?category=secondary&conversation=${encodeURIComponent(conv.id)}` as any);
    } catch (e: any) {
      alert(e?.data?.code || e?.message || "DM failed");
    } finally { setMsgLoading(null); }
  };

  const canOpenWorkspace = (acc: DirectoryItem | null): boolean => {
    if (!acc || !acc.linkedEntityType || !acc.linkedEntityId) return false;
    if (!user) return false;
    const role = user.role;
    if (role === "manager" || role === "admin") return true;
    if (role === "supervisor") {
      // supervisor can open linked worker or customer (customer management), but not supplier
      if (acc.linkedEntityType === "supplier") return false;
      return acc.linkedEntityType === "worker" || acc.linkedEntityType === "customer";
    }
    return false;
  };

  const handleOpenWorkspace = (acc: DirectoryItem) => {
    if (!acc.linkedEntityType || !acc.linkedEntityId) return;
    const map: Record<string, string> = { worker: "/rvb/workers", supplier: "/rvb/suppliers", customer: "/rvb/customers" };
    const base = map[acc.linkedEntityType];
    if (!base) return;
    // Navigate to workspace with entity id as query/hash? Workers page uses details modal via id - simplest is go to base
    // We add ?entity=xxx to allow workspace to highlight
    router.push(`${base}?entity=${encodeURIComponent(acc.linkedEntityId)}` as any);
  };

  const emptyText = useMemo(() => {
    if (debounced) return t.noMatch;
    if (role === "worker") return t.noWorkers;
    if (role === "supplier") return t.noSuppliers;
    if (role === "customer") return t.noCustomers;
    return t.noAccounts;
  }, [debounced, role, t]);

  const filteredCount = items.length;

  return (
    <div className={styles.pageRoot} dir={isRtl ? "rtl" : "ltr"}>
      <div className={styles.searchBar}>
        <Search size={16} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchPlaceholder} aria-label={t.searchPlaceholder} />
        {search && <button className={styles.clearButton} onClick={() => setSearch("")} aria-label="Clear"><X size={14} /></button>}
      </div>

      <div className={styles.filterBar} role="tablist" aria-label="Role filters">
        {ROLE_FILTERS.map((f) => (
          <button key={f.key} role="tab" aria-selected={role === f.key} className={`${styles.filterPill} ${role === f.key ? styles.filterActive : ""}`} onClick={() => handleSearchRole(f.key)}>
            {(t as any)[f.labelKey]}
          </button>
        ))}
      </div>

      <div className={styles.resultsArea}>
        {loading && filteredCount === 0 ? (
          <div className={styles.grid}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={styles.skeletonCard} />
            ))}
          </div>
        ) : error ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Search size={28} /></div>
            <strong>{error}</strong>
            <button className={styles.primaryButton} onClick={() => void load(true, 1)}>{t.retry}</button>
          </div>
        ) : filteredCount === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><User size={28} /></div>
            <strong>{emptyText}</strong>
            <small style={{ color: "var(--muted)" }}>{total === 0 ? "" : `${total} total`}</small>
          </div>
        ) : (
          <>
            <div className={styles.grid}>
              {items.map((acc) => {
                const isSelf = acc.id === myId;
                return (
                  <div key={acc.id} className={styles.card} onClick={() => void handleOpenProfile(acc)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") void handleOpenProfile(acc); }} aria-label={`${acc.displayName} profile`}>
                    <div className={styles.cardHeader}>
                      <span className={styles.avatar}>
                        {acc.profilePicture ? <img src={acc.profilePicture} alt="" /> : initials(acc.displayName)}
                      </span>
                      <span className={styles.cardMeta}>
                        <strong className={styles.displayName}>{acc.displayName} {isSelf && <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>· {t.self}</span>}</strong>
                        <span className={styles.tag} dir="ltr">@{acc.tag}</span>
                        <span className={`${styles.roleBadge} ${styles["role_" + acc.role]}`}>{(t.roleLabels as any)[acc.role] || acc.role}</span>
                      </span>
                    </div>
                    <div className={styles.cardActions}>
                      {!isSelf && (
                        <button className={styles.messageButton} onClick={(e) => { e.stopPropagation(); void handleMessage(acc.id); }} disabled={!!msgLoading} aria-label={`Message ${acc.displayName}`}>
                          <MessageSquare size={14} /> {msgLoading === acc.id ? "…" : t.message}
                        </button>
                      )}
                      <button className={styles.profileButton} onClick={(e) => { e.stopPropagation(); void handleOpenProfile(acc); }}>
                        <User size={14} /> {t.profile}
                      </button>
                    </div>
                    {canOpenWorkspace(acc) && (
                      <button className={styles.workspaceLink} onClick={(e) => { e.stopPropagation(); handleOpenWorkspace(acc); }}>
                        <ExternalLink size={12} /> {t.openWorkspace}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {page < totalPages && (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
                <button className={styles.secondaryButton} onClick={() => void load(false, page + 1)} disabled={loading}>{t.loadMore}</button>
              </div>
            )}
            <small style={{ display: "block", textAlign: "center", color: "var(--subtle)", fontSize: 11, paddingTop: 8 }}>{filteredCount} / {total}</small>
          </>
        )}
      </div>

      {profile && (
        <div className={styles.drawerBackdrop} onClick={() => setProfile(null)}>
          <section className={styles.drawer} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} dir={isRtl ? "rtl" : "ltr"}>
            <div className={styles.drawerHeader}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{t.profile}</h3>
              <button className={styles.iconButton} onClick={() => setProfile(null)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className={styles.drawerBody}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center", padding: "8px 0 12px" }}>
                <span className={styles.drawerAvatar}>
                  {profile.profilePicture ? <img src={profile.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(profile.displayName)}
                </span>
                <div>
                  <strong style={{ display: "block", fontSize: 16 }}>{profile.displayName}</strong>
                  <span dir="ltr" style={{ fontSize: 13, color: "var(--muted)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>@{profile.tag}</span>
                  <span className={`${styles.roleBadge} ${styles["role_" + profile.role]}`} style={{ marginTop: 6, display: "inline-block" }}>{(t.roleLabels as any)[profile.role] || profile.role}</span>
                  {profile.id === myId && <small style={{ display: "block", marginTop: 4, color: "var(--muted)" }}>{t.self}</small>}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {profile.id !== myId && (
                    <button className={styles.primaryButton} style={{ flex: 1, justifyContent: "center" }} onClick={() => void handleMessage(profile.id)} disabled={!!msgLoading}><MessageSquare size={14} /> {t.message}</button>
                  )}
                  {canOpenWorkspace(profile) && (
                    <button className={styles.secondaryButton} style={{ flex: 1, justifyContent: "center" }} onClick={() => { handleOpenWorkspace(profile); setProfile(null); }}><ExternalLink size={14} /> {t.openWorkspace}</button>
                  )}
                </div>
                {profile.linkedEntityType && (
                  <small style={{ textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
                    Linked: {profile.linkedEntityType} {profile.linkedEntityId ? profile.linkedEntityId.slice(0, 8) : ""}
                  </small>
                )}
                {profileLoading && <small style={{ textAlign: "center", color: "var(--muted)" }}>{t.loading}</small>}
              </div>

              <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--panel-hover)", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                Directory profile shows safe identity only. Business data (salary, balance, orders) is not exposed here. Use workspace links if authorized.
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function RvbDirectoryPage() {
  return (
    <RvbAuthGuard>
      <RvbShell activePage="directory">
        <DirectoryInner />
      </RvbShell>
    </RvbAuthGuard>
  );
}
