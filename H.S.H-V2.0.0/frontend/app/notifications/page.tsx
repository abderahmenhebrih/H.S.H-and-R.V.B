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
  { key: "tasks", label: { en: "Tasks", fr: "Tâches", ar: "المهام" } },
  { key: "financial", label: { en: "Financial", fr: "Financier", ar: "المالية" } },
  { key: "inventory", label: { en: "Inventory", fr: "Stock", ar: "المخزون" } },
  { key: "system", label: { en: "System", fr: "Système", ar: "النظام" } },
] as const;

function formatDateGroup(ts: number, lang: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return lang === "ar" ? "اليوم" : lang === "fr" ? "Aujourd'hui" : "Today";
  if (days === 1) return lang === "ar" ? "أمس" : lang === "fr" ? "Hier" : "Yesterday";
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

export default function NotificationsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const all = await notificationService.getFiltered({ type: filter, search: search || undefined });
    // Handle unreadOnly via filter
    let filtered = all;
    if (filter === "unread") filtered = all.filter((n) => !n.readAt);
    setNotifications(filtered);
    setLoading(false);
  };

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

  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead();
    await load();
  };

  const handleMarkRead = async (n: Notification) => {
    if (!n.readAt) await notificationService.markAsRead(n.id);
    if (n.route) router.push(n.route);
    else await load();
  };

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
