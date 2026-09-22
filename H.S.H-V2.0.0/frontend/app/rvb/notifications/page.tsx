"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RvbShell from "../../../src/components/rvb/RvbShell";
import RvbAuthGuard from "../../../src/components/rvb/RvbAuthGuard";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import { settingsService } from "../../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { rvbNotificationService } from "../../../src/services/rvb-notification.service";
import { rvbActivityService } from "../../../src/services/rvb-activity.service";
import { connectChatSocket, getChatSocket } from "../../../src/services/chat-socket.service";
import StyledSelect from "../../../src/components/common/StyledSelect";
import { Search, CheckCheck, Archive, ArchiveRestore, Trash2, MoreHorizontal, Bell, Activity as ActivityIcon, Eye, Undo2, Inbox, Filter, Calendar, AlertTriangle, MessageSquare, FileText, ShoppingCart, Users, Truck, ShieldCheck, Settings as SettingsIcon } from "lucide-react";
import styles from "./page.module.css";

const TR: Record<string, any> = {
  en: {
    title: "Notifications & Activity",
    subtitle: "Manage notifications, priorities and activity history.",
    notifications: "Notifications",
    activity: "Activity",
    search: "Search notifications...",
    searchActivity: "Search activity...",
    markAllRead: "Mark all as read",
    selectAll: "Select all",
    selected: "selected",
    bulkRead: "Mark read",
    bulkUnread: "Mark unread",
    bulkArchive: "Archive",
    bulkRestore: "Restore",
    all: "All",
    unread: "Unread",
    read: "Read",
    archived: "Archived",
    sources: "All Sources",
    chats: "Chats",
    requests: "Requests",
    orders: "Orders",
    accounts: "Accounts",
    workers: "Workers",
    suppliers: "Suppliers",
    customers: "Customers",
    system: "System",
    priorityAll: "All Priorities",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
    dateAll: "All time",
    today: "Today",
    last7: "Last 7 days",
    last30: "Last 30 days",
    review: "Review",
    openChat: "Open Chat",
    viewOrder: "View Order",
    view: "View",
    noNotifications: "No notifications yet.",
    noUnread: "You're all caught up.",
    noArchived: "No archived notifications.",
    noMatch: "No notifications match your search.",
    noActivity: "No activity yet.",
    noActivityMatch: "No activity matches these filters.",
    loadMore: "Load more",
    emptyNotifications: "No notifications to display.",
    todayLabel: "Today",
    yesterdayLabel: "Yesterday",
    actorAll: "All actors",
    loadError: "Failed to load",
    retry: "Retry",
    markRead: "Mark as read",
    markUnread: "Mark as unread",
    archiveBtn: "Archive",
    restoreBtn: "Restore",
  },
  fr: {
    title: "Notifications & Activité",
    subtitle: "Gérez les notifications, priorités et historique d'activité.",
    notifications: "Notifications",
    activity: "Activité",
    search: "Rechercher notifications...",
    searchActivity: "Rechercher activité...",
    markAllRead: "Tout marquer comme lu",
    selectAll: "Tout sélectionner",
    selected: "sélectionné",
    bulkRead: "Marquer lu",
    bulkUnread: "Marquer non lu",
    bulkArchive: "Archiver",
    bulkRestore: "Restaurer",
    all: "Tous",
    unread: "Non lus",
    read: "Lus",
    archived: "Archivés",
    sources: "Toutes les sources",
    chats: "Discussions",
    requests: "Demandes",
    orders: "Commandes",
    accounts: "Comptes",
    workers: "Travailleurs",
    suppliers: "Fournisseurs",
    customers: "Clients",
    system: "Système",
    priorityAll: "Toutes priorités",
    normal: "Normal",
    high: "Élevée",
    urgent: "Urgente",
    dateAll: "Toutes dates",
    today: "Aujourd'hui",
    last7: "7 derniers jours",
    last30: "30 derniers jours",
    review: "Examiner",
    openChat: "Ouvrir chat",
    viewOrder: "Voir commande",
    view: "Voir",
    noNotifications: "Aucune notification.",
    noUnread: "Vous êtes à jour.",
    noArchived: "Aucune archive.",
    noMatch: "Aucun résultat.",
    noActivity: "Aucune activité.",
    noActivityMatch: "Aucune activité correspondante.",
    loadMore: "Charger plus",
    emptyNotifications: "Aucune notification à afficher.",
    todayLabel: "Aujourd'hui",
    yesterdayLabel: "Hier",
    actorAll: "Tous acteurs",
    loadError: "Échec du chargement",
    retry: "Réessayer",
    markRead: "Marquer lu",
    markUnread: "Marquer non lu",
    archiveBtn: "Archiver",
    restoreBtn: "Restaurer",
  },
  ar: {
    title: "الإشعارات والنشاط",
    subtitle: "إدارة الإشعارات والأولويات وسجل النشاط.",
    notifications: "الإشعارات",
    activity: "النشاط",
    search: "ابحث في الإشعارات...",
    searchActivity: "ابحث في النشاط...",
    markAllRead: "تحديد الكل كمقروء",
    selectAll: "تحديد الكل",
    selected: "محدد",
    bulkRead: "مقروء",
    bulkUnread: "غير مقروء",
    bulkArchive: "أرشفة",
    bulkRestore: "استعادة",
    all: "الكل",
    unread: "غير مقروءة",
    read: "مقروءة",
    archived: "المؤرشفة",
    sources: "كل المصادر",
    chats: "محادثات",
    requests: "طلبات",
    orders: "طلبيات",
    accounts: "حسابات",
    workers: "عمال",
    suppliers: "موردون",
    customers: "زبائن",
    system: "النظام",
    priorityAll: "كل الأولويات",
    normal: "عادية",
    high: "عالية",
    urgent: "عاجلة",
    dateAll: "كل التواريخ",
    today: "اليوم",
    last7: "آخر 7 أيام",
    last30: "آخر 30 يوم",
    review: "مراجعة",
    openChat: "فتح المحادثة",
    viewOrder: "عرض الطلبية",
    view: "عرض",
    noNotifications: "لا توجد إشعارات.",
    noUnread: "أنت على اطلاع.",
    noArchived: "لا يوجد مؤرشف.",
    noMatch: "لا نتائج.",
    noActivity: "لا يوجد نشاط.",
    noActivityMatch: "لا نشاط مطابق.",
    loadMore: "تحميل المزيد",
    emptyNotifications: "لا إشعارات للعرض.",
    todayLabel: "اليوم",
    yesterdayLabel: "أمس",
    actorAll: "كل الفاعلين",
    loadError: "فشل التحميل",
    retry: "إعادة",
    markRead: "تحديد مقروء",
    markUnread: "تحديد غير مقروء",
    archiveBtn: "أرشفة",
    restoreBtn: "استعادة",
  },
};

function relativeTime(ts: number, lang: string): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return lang === "ar" ? "الآن" : lang === "fr" ? "À l'instant" : "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return lang === "ar" ? `منذ ${m} د` : lang === "fr" ? `il y a ${m} min` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "ar" ? `منذ ${h} س` : lang === "fr" ? `il y a ${h} h` : `${h} h ago`;
  const d = Math.floor(h / 24);
  return lang === "ar" ? `منذ ${d} يوم` : lang === "fr" ? `il y a ${d} j` : `${d} d ago`;
}
function formatActivityDate(ts: number, lang: string): string {
  const d = new Date(ts);
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB", { day: "2-digit", month: "short", year: "numeric", numberingSystem: "latn" } as any).format(d);
  } catch { return d.toLocaleDateString(); }
}
function groupLabel(ts: number, lang: string, t: any): string {
  const now = new Date(); const d = new Date(ts);
  const isToday = now.toDateString() === d.toDateString();
  if (isToday) return t.todayLabel;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (y.toDateString() === d.toDateString()) return t.yesterdayLabel;
  return formatActivityDate(ts, lang);
}

function priorityClass(p?: string): string {
  if (p === "urgent") return `${styles.priorityBadge} ${styles.priorityUrgent}`;
  if (p === "high") return `${styles.priorityBadge} ${styles.priorityHigh}`;
  return `${styles.priorityBadge} ${styles.priorityNormal}`;
}
function sourceIcon(type: string): string {
  const map: Record<string, string> = {
    customer_order: "🛒", task: "✅", payment: "💳", purchase: "📦", sale: "💰", expense: "🧾", transfer: "↔️", worker: "👷", vehicle: "🚚", inventory: "📊", account: "🏦", sync: "🔄", system: "⚙️",
  };
  return map[type] || "🔔";
}

function deepLinkForNotification(n: any): string | null {
  if (n.route) return n.route;
  // derive from type
  if (n.type === "system" && n.entityType === "conversation") return "/rvb/chats";
  if (n.type === "worker") return "/rvb/requests";
  if (n.type === "purchase") return "/rvb/requests";
  if (n.type === "customer_order") return "/rvb/orders";
  if (n.type === "account") return "/rvb/accounts";
  return null;
}

function NotificationsInner() {
  const router = useRouter();
  const { user } = useRvbAuth();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const lang = (settings.language as any) || "en";
  const t = TR[lang] ?? TR.en;
  const isRtl = lang === "ar";

  const [tab, setTab] = useState<"notifications" | "activity">("notifications");

  // Notifications state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [priority, setPriority] = useState("all");
  const [date, setDate] = useState("all");
  const [page, setPage] = useState(1);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Activity state
  const [actSearch, setActSearch] = useState("");
  const [actDebounced, setActDebounced] = useState("");
  const [actSource, setActSource] = useState("all");
  const [actDate, setActDate] = useState("all");
  const [activities, setActivities] = useState<any[]>([]);
  const [actTotal, setActTotal] = useState(0);
  const [actPages, setActPages] = useState(1);
  const [actPage, setActPage] = useState(1);
  const [actLoading, setActLoading] = useState(false);
  const [actError, setActError] = useState("");

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
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 380);
    return () => clearTimeout(id);
  }, [searchInput]);
  useEffect(() => {
    const id = setTimeout(() => setActDebounced(actSearch.trim()), 380);
    return () => clearTimeout(id);
  }, [actSearch]);

  const loadNotifications = useCallback(async (reset = false, p = page) => {
    if (tab !== "notifications") return;
    setLoading(true);
    setError("");
    const targetPage = reset ? 1 : p;
    try {
      const data = await rvbNotificationService.list({ status: status as any, source, priority, date, search: debouncedSearch || undefined, page: targetPage, limit: 20 });
      if (reset) {
        setNotifications(data.notifications || []);
      } else {
        setNotifications((prev) => targetPage === 1 ? (data.notifications || []) : [...prev, ...(data.notifications || [])]);
      }
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setUnreadCount(data.unreadCount ?? 0);
      setPage(targetPage);
    } catch (e: any) {
      setError(e?.message || t.loadError);
    } finally { setLoading(false); }
  }, [tab, status, source, priority, date, debouncedSearch, page, t.loadError]);

  const loadActivities = useCallback(async (reset = false, p = actPage) => {
    if (tab !== "activity") return;
    setActLoading(true);
    setActError("");
    const targetPage = reset ? 1 : p;
    try {
      const data = await rvbActivityService.list({ source: actSource, search: actDebounced || undefined, date: actDate, page: targetPage, limit: 25 });
      if (reset || targetPage === 1) setActivities(data.activities || []);
      else setActivities((prev) => [...prev, ...(data.activities || [])]);
      setActTotal(data.total ?? 0);
      setActPages(data.totalPages ?? 1);
      setActPage(targetPage);
    } catch (e: any) {
      setActError(e?.message || t.loadError);
    } finally { setActLoading(false); }
  }, [tab, actSource, actDebounced, actDate, actPage, t.loadError]);

  // Initial and filter change loads
  useEffect(() => {
    setPage(1);
    void loadNotifications(true, 1);
  }, [status, source, priority, date, debouncedSearch, tab === "notifications" ? "on" : "off"]);
  useEffect(() => {
    setActPage(1);
    void loadActivities(true, 1);
  }, [actSource, actDebounced, actDate, tab === "activity" ? "on" : "off"]);

  useEffect(() => {
    // Tab switch triggers load
    if (tab === "notifications") void loadNotifications(true, 1);
    else void loadActivities(true, 1);
  }, [tab]);

  // Realtime via chat socket (rvb:notification)
  useEffect(() => {
    const sock = connectChatSocket();
    if (!sock) return;
    const onNotif = () => {
      if (tab === "notifications") void loadNotifications(true, 1);
    };
    sock.on("rvb:notification", onNotif);
    const onLocal = () => { if (tab === "notifications") void loadNotifications(true, 1); };
    window.addEventListener("hebrih-rvb-notifications-changed", onLocal);
    return () => {
      sock.off("rvb:notification", onNotif);
      window.removeEventListener("hebrih-rvb-notifications-changed", onLocal);
    };
  }, [tab, loadNotifications]);

  const handleOpen = async (n: any) => {
    try {
      if (!n.readAt && !n.archivedAt) {
        try { await rvbNotificationService.markRead(n.id); } catch {}
        window.dispatchEvent(new CustomEvent("hebrih-rvb-notifications-changed"));
        setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, readAt: Date.now() } : x));
      }
    } catch {}
    const route = deepLinkForNotification(n) || n.route;
    if (route) router.push(route as any);
  };

  const handleToggleRead = async (n: any) => {
    const isRead = !!n.readAt;
    try {
      await rvbNotificationService.markRead(n.id, isRead);
    } catch (e: any) {
      alert(e?.message || "Failed");
      return;
    }
    window.dispatchEvent(new CustomEvent("hebrih-rvb-notifications-changed"));
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, readAt: isRead ? null : Date.now() } : x));
  };

  const handleArchive = async (n: any, restore = false) => {
    try {
      if (restore) await rvbNotificationService.restore(n.id);
      else await rvbNotificationService.archive(n.id, true);
      window.dispatchEvent(new CustomEvent("hebrih-rvb-notifications-changed"));
      // Remove from list if filtering excludes archived, else toggle
      await loadNotifications(true, 1);
    } catch (e: any) { alert(e?.message || "Archive failed"); }
  };

  const handleMarkAllRead = async () => {
    try {
      await rvbNotificationService.markAllRead();
    } catch (e: any) {
      alert(e?.message || "Failed");
      return;
    }
    window.dispatchEvent(new CustomEvent("hebrih-rvb-notifications-changed"));
    await loadNotifications(true, 1);
  };

  const handleBulk = async (action: "read" | "unread" | "archive" | "restore") => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      await rvbNotificationService.bulk(ids, action);
    } catch (e: any) {
      alert(e?.message || "Bulk failed");
      setBulkLoading(false);
      return;
    }
    window.dispatchEvent(new CustomEvent("hebrih-rvb-notifications-changed"));
    setSelected(new Set());
    await loadNotifications(true, 1);
    setBulkLoading(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => {
    if (selected.size === notifications.length) setSelected(new Set());
    else setSelected(new Set(notifications.map((n) => n.id)));
  };

  // Group notifications by date
  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const n of notifications) {
      const key = groupLabel(n.createdAt, lang, t);
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    }
    return groups;
  }, [notifications, lang, t]);

  const groupedActivities = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const a of activities) {
      const key = groupLabel(a.createdAt, lang, t);
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }
    return groups;
  }, [activities, lang, t]);

  const isManager = user?.role === "manager" || user?.role === "admin";

  return (
    <RvbShell activePage="notifications">
      <div className={styles.pageRoot} dir={isRtl ? "rtl" : "ltr"}>
        <div className={styles.tabsBar} role="tablist">
          <button role="tab" aria-selected={tab === "notifications"} className={`${styles.tab} ${tab === "notifications" ? styles.tabActive : ""}`} onClick={() => setTab("notifications")}><Bell size={14} />{t.notifications}</button>
          <button role="tab" aria-selected={tab === "activity"} className={`${styles.tab} ${tab === "activity" ? styles.tabActive : ""}`} onClick={() => setTab("activity")}><ActivityIcon size={14} />{t.activity}</button>
        </div>

        {tab === "notifications" ? (
          <>
            <div className={styles.toolbar}>
              <div className={styles.searchRow}>
                <div className={styles.searchBox}>
                  <Search size={14} />
                  <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t.search} aria-label={t.search} />
                </div>
                <button className={styles.actionButton} onClick={selectAllVisible}>{selected.size === notifications.length && notifications.length ? "Unselect" : t.selectAll}</button>
                {selected.size > 0 && <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>{selected.size} {t.selected}</span>}
              </div>

              <div className={styles.filterRow}>
                <StyledSelect value={status} onChange={setStatus} ariaLabel="Status" options={[
                  { value: "all", label: t.all }, { value: "unread", label: t.unread }, { value: "read", label: t.read }, { value: "archived", label: t.archived },
                ]} />
                <StyledSelect value={source} onChange={setSource} ariaLabel="Source" options={[
                  { value: "all", label: t.sources }, { value: "chats", label: t.chats }, { value: "requests", label: t.requests }, { value: "orders", label: t.orders }, { value: "accounts", label: t.accounts }, { value: "workers", label: t.workers }, { value: "suppliers", label: t.suppliers }, { value: "customers", label: t.customers }, { value: "system", label: t.system },
                ]} />
                <StyledSelect value={priority} onChange={setPriority} ariaLabel="Priority" options={[
                  { value: "all", label: t.priorityAll }, { value: "normal", label: t.normal }, { value: "high", label: t.high }, { value: "urgent", label: t.urgent },
                ]} />
                <StyledSelect value={date} onChange={setDate} ariaLabel="Date" options={[
                  { value: "all", label: t.dateAll }, { value: "today", label: t.today }, { value: "7days", label: t.last7 }, { value: "30days", label: t.last30 },
                ]} />
                <button className={`${styles.actionButton} ${styles.primaryAction} ${styles.markAllButton}`} onClick={handleMarkAllRead} disabled={unreadCount === 0}><CheckCheck size={14} />{t.markAllRead}</button>
              </div>

              {selected.size > 0 && (
                <div className={styles.bulkBar}>
                  <strong style={{ fontSize: 12 }}>{selected.size} {t.selected}</strong>
                  <button className={styles.actionButton} onClick={() => handleBulk("read")} disabled={bulkLoading}><Eye size={14} />{t.bulkRead}</button>
                  <button className={styles.actionButton} onClick={() => handleBulk("unread")} disabled={bulkLoading}><Undo2 size={14} />{t.bulkUnread}</button>
                  <button className={styles.actionButton} onClick={() => handleBulk(status === "archived" ? "restore" : "archive")} disabled={bulkLoading}>{status === "archived" ? <ArchiveRestore size={14} /> : <Archive size={14} />}{status === "archived" ? t.bulkRestore : t.bulkArchive}</button>
                </div>
              )}
            </div>

            {loading && notifications.length === 0 ? (
              <div className={styles.listContainer}><div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
            ) : error ? (
              <div className={styles.emptyState}><AlertTriangle size={24} /><strong>{error}</strong><button className={styles.actionButton} onClick={() => void loadNotifications(true, 1)}>{t.retry}</button></div>
            ) : notifications.length === 0 ? (
              <div className={styles.emptyState}>
                <Inbox size={28} />
                <strong>{status === "unread" ? t.noUnread : status === "archived" ? t.noArchived : searchInput || source !== "all" || priority !== "all" ? t.noMatch : t.noNotifications}</strong>
                <p style={{ fontSize: 12 }}>{status === "archived" ? "" : t.emptyNotifications}</p>
              </div>
            ) : (
              <div className={styles.listContainer}>
                {Object.entries(grouped).map(([grp, items]) => (
                  <section key={grp} className={styles.group}>
                    <h3 className={styles.groupTitle}>{grp}</h3>
                    <div className={styles.cards}>
                      {items.map((n) => {
                        const isSelected = selected.has(n.id);
                        const isUnread = !n.readAt && !n.archivedAt;
                        const isArchived = !!n.archivedAt;
                        const prio = (n.priority || "normal") as string;
                        return (
                          <div key={n.id} className={`${styles.card} ${isUnread ? styles.cardUnread : ""} ${isArchived ? styles.cardArchived : ""}`} onClick={() => handleOpen(n)} style={{ cursor: "pointer" }}>
                            <div className={styles.cardLeft}>
                              <span className={styles.iconWrap} aria-hidden="true">{sourceIcon(n.type)}</span>
                              {isUnread && <span className={styles.unreadDot} aria-hidden="true" />}
                              <input type="checkbox" checked={isSelected} onChange={(e) => { e.stopPropagation(); toggleSelect(n.id); }} onClick={(e) => e.stopPropagation()} aria-label="Select" />
                            </div>
                            <div className={styles.cardMain}>
                              <div className={styles.cardHeader}>
                                <strong className={`${styles.cardTitle} ${isUnread ? styles.cardTitleUnread : ""}`}>{n.title}</strong>
                                <span className={priorityClass(prio)}>{prio === "urgent" ? t.urgent : prio === "high" ? t.high : t.normal}</span>
                              </div>
                              <div className={styles.cardMessage}>{n.message}</div>
                              <div className={styles.cardMeta}>
                                {n.entityType && <span className={styles.sourcePill}>{n.entityType} · {n.entityId?.slice(0, 10) || ""}</span>}
                                {n.audienceType === "role" && <span className={styles.sourcePill}>{n.audienceIds?.join(", ")}</span>}
                                {n.sourceEventId && <span style={{ direction: "ltr", unicodeBidi: "plaintext" }}>{n.sourceEventId.slice(0, 28)}</span>}
                              </div>
                            </div>
                            <div className={styles.cardRight}>
                              <small className={styles.time}>{relativeTime(n.createdAt, lang)}</small>
                              <div className={styles.cardActions}>
                                {!isArchived && (isUnread ? (
                                  <button className={styles.smallButton} onClick={(e) => { e.stopPropagation(); void handleToggleRead(n); }}><CheckCheck size={12} />{t.markRead}</button>
                                ) : (
                                  <button className={styles.smallButton} onClick={(e) => { e.stopPropagation(); void handleToggleRead(n); }}><Undo2 size={12} />{t.markUnread}</button>
                                ))}
                                {isArchived ? (
                                  <button className={styles.smallButton} onClick={(e) => { e.stopPropagation(); void handleArchive(n, true); }}><ArchiveRestore size={12} />{t.restoreBtn}</button>
                                ) : (
                                  <button className={styles.smallButton} onClick={(e) => { e.stopPropagation(); void handleArchive(n, false); }}><Archive size={12} />{t.archiveBtn}</button>
                                )}
                                {deepLinkForNotification(n) && <button className={`${styles.smallButton} ${styles.smallPrimary}`} onClick={(e) => { e.stopPropagation(); void handleOpen(n); }}><Eye size={12} />{status === "archived" ? t.view : t.review}</button>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {page < totalPages && (
                  <button className={styles.loadMore} onClick={() => void loadNotifications(false, page + 1)} disabled={loading}>{t.loadMore}</button>
                )}
                <small style={{ textAlign: "center", color: "var(--subtle)", fontSize: 11 }}>{total} total · {unreadCount} unread</small>
              </div>
            )}
          </>
        ) : (
          <>
            <div className={styles.toolbar}>
              <div className={styles.searchRow}>
                <div className={styles.searchBox}>
                  <Search size={14} />
                  <input value={actSearch} onChange={(e) => setActSearch(e.target.value)} placeholder={t.searchActivity} aria-label={t.searchActivity} />
                </div>
              </div>
              <div className={styles.filterRow}>
                <StyledSelect value={actSource} onChange={setActSource} ariaLabel="Activity source" options={[
                  { value: "all", label: t.all }, { value: "accounts", label: t.accounts }, { value: "workers", label: t.workers }, { value: "suppliers", label: t.suppliers }, { value: "customers", label: t.customers }, { value: "requests", label: t.requests }, { value: "orders", label: t.orders }, { value: "chats", label: t.chats }, { value: "system", label: t.system },
                ]} />
                <StyledSelect value={actDate} onChange={setActDate} ariaLabel="Activity date" options={[
                  { value: "all", label: t.dateAll }, { value: "today", label: t.today }, { value: "7days", label: t.last7 }, { value: "30days", label: t.last30 },
                ]} />
              </div>
            </div>

            {actLoading && activities.length === 0 ? (
              <div className={styles.listContainer}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
            ) : actError ? (
              <div className={styles.emptyState}><AlertTriangle size={24} /><strong>{actError}</strong><button className={styles.actionButton} onClick={() => void loadActivities(true, 1)}>{t.retry}</button></div>
            ) : activities.length === 0 ? (
              <div className={styles.emptyState}><ActivityIcon size={28} /><strong>{actSource !== "all" || actDebounced ? t.noActivityMatch : t.noActivity}</strong></div>
            ) : (
              <div className={styles.timeline}>
                {Object.entries(groupedActivities).map(([grp, items]) => (
                  <div key={grp} className={styles.timelineGroup}>
                    <div className={styles.timelineGroupTitle}>{grp}</div>
                    {items.map((a) => (
                      <div key={a.id} className={styles.timelineItem}>
                        <span className={styles.timelineDot} aria-hidden="true" />
                        <div className={styles.timelineContent}>
                          <strong className={styles.timelineTitle}>{a.title || a.action}</strong>
                          {a.details && <span className={styles.timelineDesc}>{a.details}</span>}
                          <span className={styles.timelineMeta}>
                            {a.actorTag && <span>@{a.actorTag} · {a.actorRole}</span>}
                            <span>{relativeTime(a.createdAt, lang)}</span>
                            <span className={styles.sourcePill}>{a.sourceType}</span>
                            {a.entityType && <span>{a.entityType} {a.entityId?.slice(0, 8)}</span>}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {actPage < actPages && (
                  <button className={styles.loadMore} onClick={() => void loadActivities(false, actPage + 1)} disabled={actLoading}>{t.loadMore}</button>
                )}
                <small style={{ textAlign: "center", color: "var(--subtle)", fontSize: 11 }}>{actTotal} events</small>
              </div>
            )}
          </>
        )}
      </div>
    </RvbShell>
  );
}

export default function RvbNotificationsPage() {
  return (
    <RvbAuthGuard>
      <NotificationsInner />
    </RvbAuthGuard>
  );
}
