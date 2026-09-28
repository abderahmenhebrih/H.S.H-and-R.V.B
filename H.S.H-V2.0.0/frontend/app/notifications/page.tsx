"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import AppShell from "../../src/components/layout/AppShell";
import { notificationService } from "../../src/services/notification.service";
import type { Notification } from "../../src/types/entities/notification";
import { useDbSync } from "../../src/hooks/useDbSync";
import { settingsService } from "../../src/services/settings.service";
import { getDirection } from "../../src/lib/settings";
import type { Settings } from "../../src/types/settings/settings";
import { DEFAULT_SETTINGS } from "../../src/lib/settings";
import styles from "./page.module.css";

const FILTERS = [
  { key: "all", label: { en: "All", fr: "Tous", ar: "الكل" } },
  { key: "unread", label: { en: "Unread", fr: "Non lus", ar: "غير مقروءة" } },
  { key: "orders", label: { en: "Orders", fr: "Commandes", ar: "الطلبات" } },
  { key: "task", label: { en: "Tasks", fr: "Tâches", ar: "المهام" } },
  { key: "financial", label: { en: "Financial", fr: "Financier", ar: "المالية" } },
  { key: "inventory", label: { en: "Inventory", fr: "Stock", ar: "المخزون" } },
  { key: "system", label: { en: "System", fr: "Système", ar: "النظام" } },
] as const;

function formatDateGroup(ts: number, lang: string): string {
  const d = new Date(ts);
  const now = new Date();
  if (now.toDateString() === d.toDateString()) return lang === "ar" ? "اليوم" : lang === "fr" ? "Aujourd'hui" : "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) return lang === "ar" ? "أمس" : lang === "fr" ? "Hier" : "Yesterday";
  return lang === "ar" ? "سابقا" : lang === "fr" ? "Plus tôt" : "Earlier";
}

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

// PBS-BUG-038: page-local latest-load-wins guard. A plain (non-ref) instance
// held in state so handlers can read it without ref-access lint hazards.
// Only the newest generation may commit; stale completions are dropped.
type NotifLoadGuard = {
  next: () => number;
  isCurrent: (seq: number) => boolean;
  invalidate: () => void;
};

function createNotifLoadGuard(): NotifLoadGuard {
  const state = { seq: 0, mounted: true };
  return {
    next: () => ++state.seq,
    isCurrent: (seq: number) => seq === state.seq && state.mounted,
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
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // PBS-BUG-038: latest-load-wins generation guard + unmount safety.
  // filter/search are captured once per load (coherent snapshot); only the
  // newest generation may commit notifications/loading. Stale completions
  // return without writing state. Covers effect, useDbSync, manual refresh,
  // and mark-read reconciliation loads.
  const [notifGuard] = useState(createNotifLoadGuard);

  useEffect(() => {
    return () => {
      notifGuard.invalidate();
    };
  }, [notifGuard]);

  async function load() {
    const seq = notifGuard.next();
    const activeFilter = filter;
    const activeSearch = search;
    setLoading(true);
    try {
      if (activeFilter === "unread") {
        const all = await notificationService.getFiltered({ type: "all", search: activeSearch || undefined });
        if (!notifGuard.isCurrent(seq)) return;
        setNotifications(all.filter((n) => !n.readAt));
      } else {
        // Normalize legacy "tasks" to correct type "task"
        const typeParam = activeFilter === "tasks" ? "task" : activeFilter;
        const all = await notificationService.getFiltered({ type: typeParam, search: activeSearch || undefined });
        if (!notifGuard.isCurrent(seq)) return;
        setNotifications(all);
      }
    } finally {
      if (notifGuard.isCurrent(seq)) {
        setLoading(false);
      }
    }
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

  const grouped = useMemo(() => {
    const groups: Record<string, Notification[]> = {};
    for (const n of notifications) {
      const key = formatDateGroup(n.createdAt, settings.language);
      if (!groups[key]) groups[key] = [];
      groups[key].push(n);
    }
    return groups;
  }, [notifications, settings.language]);

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
    // PBS-BUG-038: persist first; then race-safe local reconciliation BEFORE
    // navigating, so a routed mark-read cannot leave stale unread state
    // behind. A refresh failure never blocks navigation nor fabricates data.
    if (!n.readAt) await notificationService.markAsRead(n.id);
    await load().catch(() => {});
    if (n.route) router.push(n.route);
  }

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <AppShell activePage="settings">
      <div className={styles.header}>
        <div>
          <h1>{t("Notifications", "Notifications", "الإشعارات")}</h1>
          <p>{t("Stay informed about important activity across the system.", "Restez informé des activités importantes.", "ابق على اطلاع بالأنشطة المهمة.")}</p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className={styles.markAllButton} onClick={handleMarkAllRead}>
            {t("Mark all as read", "Tout marquer comme lu", "تحديد الكل كمقروء")}
          </button>
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={filter === f.key ? styles.filterActive : styles.filter}
              onClick={() => setFilter(f.key)}
            >
              {t(f.label.en, f.label.fr, f.label.ar)}
            </button>
          ))}
        </div>
        <div className={styles.searchBox}>
          <Search size={16} strokeWidth={2} aria-hidden="true" />
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
          <strong>{t("No notifications", "Aucune notification", "لا توجد إشعارات")}</strong>
          <p>{t("You're all caught up.", "Vous êtes à jour.", "أنت على اطلاع دائم.")}</p>
        </div>
      ) : (
        Object.entries(grouped).map(([group, items]) => (
          <section key={group} className={styles.group}>
            <h2 className={styles.groupTitle}>{group}</h2>
            <div className={styles.list}>
              {items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`${styles.item} ${!n.readAt ? styles.unread : ""}`}
                  onClick={() => handleMarkRead(n)}
                >
                  <div className={styles.itemHeader}>
                    <strong>{n.title}</strong>
                    <small>{formatTime(n.createdAt, settings.language)}</small>
                  </div>
                  <p className={styles.itemMessage}>{n.message}</p>
                  {!n.readAt && <span className={styles.unreadDot} />}
                </button>
              ))}
            </div>
          </section>
        ))
      )}
    </AppShell>
  );
}
