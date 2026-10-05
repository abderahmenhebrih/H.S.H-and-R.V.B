"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { getImportantCount, getNotificationImportance, getUnreadCount, groupNotificationsByDay, notifLabel, visibleNotifications } from "../../src/lib/notification-presentation";
import AppShell from "../../src/components/layout/AppShell";
import { notificationService } from "../../src/services/notification.service";
import type { Notification } from "../../src/types/entities/notification";
import { useDbSync } from "../../src/hooks/useDbSync";
import { settingsService } from "../../src/services/settings.service";
import { getDirection } from "../../src/lib/settings";
import type { Settings } from "../../src/types/settings/settings";
import { DEFAULT_SETTINGS } from "../../src/lib/settings";
import NotificationItem from "../../src/components/notifications/NotificationItem";
import styles from "./page.module.css";

const FILTERS = ["all", "unread", "important"] as const;
type PageFilter = (typeof FILTERS)[number];
// Control-center tabs shared with the sidebar popover: All / Unread /
// Important (important ≠ unread — read important items stay in Important).

function formatTime(ts: number, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      numberingSystem: "latn",
    } as any).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString("en-GB");
  }
}

// PBS-BUG-038 (GIORNO REVIEW REVISION): page-local latest-load-wins guard.
// A plain (non-ref) instance held in state so handlers can read it without
// ref-access lint hazards. Only the newest generation may commit; stale
// completions are dropped. activate() restores mounted=true on every REAL
// effect setup so React StrictMode setup->cleanup->setup replay ends ACTIVE
// (cleanup invalidate() bumps seq, so pre-replay generations stay stale).
type NotifLoadGuard = {
  next: () => number;
  isCurrent: (seq: number) => boolean;
  isActive: () => boolean;
  activate: () => void;
  invalidate: () => void;
};

function createNotifLoadGuard(): NotifLoadGuard {
  const state = { seq: 0, mounted: true };
  return {
    next: () => ++state.seq,
    isCurrent: (seq: number) => seq === state.seq && state.mounted,
    isActive: () => state.mounted,
    activate: () => {
      state.mounted = true;
    },
    invalidate: () => {
      state.mounted = false;
      state.seq++;
    },
  };
}

export default function NotificationsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<PageFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  // Authoritative header counts from the full non-archived dataset (not the
  // filtered view) — same source the sidebar badge uses, no second count.
  const [counts, setCounts] = useState({ unread: 0, important: 0, total: 0 });

  // PBS-BUG-038: latest-load-wins generation guard + unmount safety.
  // filter/search are captured once per load (coherent snapshot); only the
  // newest generation may commit notifications/loading. Stale completions
  // return without writing state. Covers effect, useDbSync, manual refresh,
  // and mark-read reconciliation loads.
  const [notifGuard] = useState(createNotifLoadGuard);

  useEffect(() => {
    notifGuard.activate();
    return () => {
      notifGuard.invalidate();
    };
  }, [notifGuard]);

  // PBS-BUG-038 REVISION 2 (stale-closure freshness): current-view holder.
  // Every render publishes its committed filter/search here; async
  // continuations (mark handlers resumed after later renders) consult the
  // holder AFTER awaits instead of their stale render closure, so generation
  // order tracks latest UI state. Layout effect keeps it synchronous with
  // commit (before paint / before pending async continuations resume).
  const currentViewRef = useRef({ filter, search });

  useLayoutEffect(() => {
    currentViewRef.current = { filter, search };
  });

  // PBS-BUG-038 REVISION 2: plain loader reading the CURRENT committed view
  // from the holder (fresh effect calls and stale async continuations alike).
  // Entry is guarded by isActive() so a post-unmount continuation performs no
  // loading work (R38); commits remain generation-guarded as before.
  async function load() {
    if (!notifGuard.isActive()) return;
    const view = currentViewRef.current;
    const seq = notifGuard.next();
    const activeFilter = view.filter;
    const activeSearch = view.search;
    setLoading(true);
    try {
      const searchParam = activeSearch || undefined;
      if (activeFilter === "unread") {
        const all = await notificationService.getFiltered({ type: "all", search: searchParam });
        if (!notifGuard.isCurrent(seq)) return;
        setNotifications(all.filter((n) => !n.readAt));
      } else if (activeFilter === "important") {
        const all = await notificationService.getFiltered({ type: "all", search: searchParam });
        if (!notifGuard.isCurrent(seq)) return;
        setNotifications(all.filter((n) => getNotificationImportance(n) === "important"));
      } else {
        const all = await notificationService.getFiltered({ type: "all", search: searchParam });
        if (!notifGuard.isCurrent(seq)) return;
        setNotifications(all);
      }
      // Header counts always come from the unfiltered working set.
      const full = await notificationService.getAll();
      if (!notifGuard.isCurrent(seq)) return;
      const vis = visibleNotifications(full);
      setCounts({
        unread: vis.filter((n) => !n.readAt).length,
        important: vis.filter((n) => getNotificationImportance(n) === "important").length,
        total: vis.length,
      });
    } finally {
      if (notifGuard.isCurrent(seq)) {
        setLoading(false);
      }
    }
  }

  // PBS-BUG-038 REVISION 2: the marked-row patch consults the CURRENT
  // committed filter (not the clicking render's) and refuses post-unmount
  // work. Read-back value still comes from the persisted store.
  async function patchMarked(id: string) {
    if (!notifGuard.isActive()) return;
    const persisted = await notificationService
      .getById(id)
      .catch(() => undefined);
    if (!notifGuard.isActive()) return;
    const readAt = persisted?.readAt;
    if (!readAt) return;
    const activeFilter = currentViewRef.current.filter;
    setNotifications((prev) => {
      const patched = prev.map((item) =>
        item.id === id ? { ...item, readAt } : item,
      );
      // A newly-read row leaves the Unread view only; read important items
      // stay in Important (importance ≠ unread).
      return activeFilter === "unread"
        ? patched.filter((item) => !item.readAt)
        : patched;
    });
  }

  useEffect(() => {
    settingsService.get().then((s) => {
      if (s) setSettings(s);
    });
  }, []);

  useEffect(() => {
    void load();
  }, [filter, search]);

  useDbSync(() => {
    void load();
  }, [filter, search]);

  // Shared Today / Yesterday / Earlier grouping (explicit order, empty
  // groups omitted) — same model as the sidebar popover.
  const grouped = useMemo(
    () => groupNotificationsByDay([...notifications].sort((a, b) => b.createdAt - a.createdAt)),
    [notifications],
  );

  const t = (en: string, fr: string, ar: string) => {
    if (settings.language === "fr") return fr;
    if (settings.language === "ar") return ar;
    return en;
  };

  async function handleMarkAllRead() {
    await notificationService.markAllAsRead();
    await load();
  }

  async function handleMarkRead(n: Notification) {
    // PBS-BUG-038 (GIORNO REVIEW REVISION R3/M2 + REVISION 2 freshness):
    // persist first; then reconcile via CURRENT-view channels (patchMarked +
    // load consult the holder synced to the latest committed filter/search,
    // so a filter/search change during the mark cannot poison this stale
    // continuation). Navigation never depends on a possibly-superseded load
    // alone. No optimistic update: the patch runs only after persistence
    // succeeds (using the persisted readAt value read back from the service),
    // and a mark failure leaves state untouched. A refresh failure never
    // blocks navigation nor fabricates data.
    // A mark failure is reported but never blocks navigation.
    if (!n.readAt) {
      try {
        await notificationService.markAsRead(n.id);
        await patchMarked(n.id);
      } catch (err) {
        console.error("[NotificationsPage] mark-read failed", err);
      }
    }
    await load().catch(() => {});
    const route = (n.route || "").trim();
    if (route) router.push(route);
  }

  // Header unread badge uses the authoritative full-dataset count.
  const unreadCount = counts.unread;

  return (
    // No AppShell hero here: this page owns a dedicated Notifications header.
    // (activePage stays "settings" so sidebar/nav architecture is untouched.)
    <AppShell activePage="settings" showHeader={false}>
      <div className={styles.feed}>
      <div className={styles.header}>
        <div>
          <h1>
            {t("Notifications", "Notifications", "الإشعارات")}
            {unreadCount > 0 && <span className={styles.headerCount}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
          </h1>
          <p>{t("Stay informed about important activity across the system.", "Restez informé des activités importantes.", "ابق على اطلاع بالأنشطة المهمة.")}</p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className={styles.markAllButton} onClick={handleMarkAllRead}>
            {notifLabel("markAllRead", settings.language)}
          </button>
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.filters} role="tablist" aria-label={t("Notifications", "Notifications", "الإشعارات")}>
          {FILTERS.map((key) => {
            const count = key === "unread" ? counts.unread : key === "important" ? counts.important : counts.total;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={filter === key ? styles.filterActive : styles.filter}
                onClick={() => setFilter(key)}
              >
                {notifLabel(key, settings.language)}
                <span className={styles.filterCount}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className={styles.searchBox}>
          <Search size={20} strokeWidth={2} aria-hidden="true" className={styles.searchIcon} />
          <input
            type="search"
            placeholder={t("Search notifications...", "Rechercher...", "البحث...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.loadingPulse} />
          <p>Loading...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className={styles.emptyState}>
          <Bell size={32} strokeWidth={1.5} aria-hidden="true" />
          <strong>
            {filter === "unread"
              ? notifLabel("emptyUnreadTitle", settings.language)
              : filter === "important"
                ? notifLabel("emptyImportantTitle", settings.language)
                : notifLabel("emptyAllTitle", settings.language)}
          </strong>
          <p>
            {filter === "unread"
              ? notifLabel("emptyUnreadBody", settings.language)
              : filter === "important"
                ? notifLabel("emptyImportantBody", settings.language)
                : notifLabel("emptyAllBody", settings.language)}
          </p>
        </div>
      ) : (
        grouped.map((group) => (
          <section key={group.key} className={styles.group} aria-label={notifLabel(group.key, settings.language)}>
            <h2 className={styles.groupTitle}>{notifLabel(group.key, settings.language)}</h2>
            <div className={styles.list}>
              {group.items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  language={settings.language}
                  showDetailDate
                  variant="page"
                  onOpen={(item) => void handleMarkRead(item)}
                />
              ))}
            </div>
          </section>
        ))
      )}
      </div>
    </AppShell>
  );
}
