"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { notificationService } from "../../services/notification.service";
import { useDbSync } from "../../hooks/useDbSync";
import type { Notification } from "../../types/entities/notification";
import {
  getImportantCount,
  getNotificationImportance,
  getUnreadCount,
  groupNotificationsByDay,
  isUnread,
  notifLabel,
  visibleNotifications,
} from "../../lib/notification-presentation";
import NotificationItem from "./NotificationItem";
import styles from "./NotificationBell.module.css";

type PopoverTab = "all" | "unread" | "important";

export default function HshNotificationBell({ language = "en", dark = false }: { language?: string; dark?: boolean }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tab, setTab] = useState<PopoverTab>("all");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const load = async () => {
    try {
      const all = await notificationService.getAll();
      // Unread-first, then newest — room for grouping (popover shows more now).
      const filtered = visibleNotifications(all)
        .sort((a, b) => {
          const aUnread = !a.readAt ? 0 : 1;
          const bUnread = !b.readAt ? 0 : 1;
          if (aUnread !== bUnread) return aUnread - bUnread;
          return b.createdAt - a.createdAt;
        })
        .slice(0, 15);
      setNotifications(filtered);
    } catch (err) {
      console.error("[HshNotificationBell] load failed", err);
    }
  };

  // Single authoritative unread count — same dataset as the list, no second count.
  const unreadCount = useMemo(() => getUnreadCount(notifications), [notifications]);
  const importantCount = useMemo(() => getImportantCount(notifications), [notifications]);

  const tabItems = useMemo(() => {
    if (tab === "unread") return notifications.filter(isUnread);
    if (tab === "important") return notifications.filter((n) => getNotificationImportance(n) === "important");
    return notifications;
  }, [notifications, tab]);

  const groups = useMemo(
    () =>
      groupNotificationsByDay([...tabItems].sort((a, b) => b.createdAt - a.createdAt)),
    [tabItems],
  );

  useEffect(() => {
    setMounted(true);
    void load();
  }, []);

  useDbSync(() => {
    void load();
  }, []);

  useEffect(() => {
    const h = () => void load();
    window.addEventListener("hebrih-notifications-changed", h);
    return () => {
      window.removeEventListener("hebrih-notifications-changed", h);
    };
  }, []);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const panelWidth = 380;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8;
    let top = rect.bottom + gap;
    let left: number | undefined;
    let right: number | undefined;
    const isRtl = document.documentElement.dir === "rtl";
    if (isRtl) {
      left = Math.max(12, rect.left);
      if (left + panelWidth > viewportWidth - 12) {
        left = Math.max(12, viewportWidth - panelWidth - 12);
      }
    } else {
      right = Math.max(12, viewportWidth - rect.right);
      const estimatedLeft = rect.right - panelWidth;
      if (estimatedLeft < 12) {
        left = 12;
        right = undefined;
      }
    }
    const maxHeight = Math.min(520, viewportHeight * 0.7);
    if (top + maxHeight > viewportHeight - 12) {
      const aboveTop = rect.top - maxHeight - gap;
      if (aboveTop > 12) {
        top = aboveTop;
      } else {
        top = Math.max(12, viewportHeight - maxHeight - 12);
      }
    }
    const style: React.CSSProperties = {
      position: "fixed",
      top: `${top}px`,
      maxHeight: `min(70vh, 520px)`,
      zIndex: 1000,
    };
    if (typeof left === "number") style.left = `${left}px`;
    if (typeof right === "number") style.right = `${right}px`;
    if (typeof left === "number" && typeof right === "number") {
      style.right = undefined;
    }
    if (viewportWidth < 420) {
      style.left = "12px";
      style.right = "12px";
      style.width = "auto";
    } else {
      style.width = "380px";
    }
    setPanelStyle(style);
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleResize = () => updatePosition();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [open, notifications.length]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (panelRef.current && panelRef.current.contains(target)) return;
      setOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleOutside);
    }, 0);
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEsc);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  const t = (en: string, fr: string, ar: string) => {
    if (language === "fr") return fr;
    if (language === "ar") return ar;
    return en;
  };

  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead();
    try { window.dispatchEvent(new CustomEvent("hebrih-notifications-changed")); } catch {}
    await load();
  };

  const handleItemClick = async (n: Notification) => {
    // Mark read first; a mark failure is reported but never blocks navigation.
    if (!n.readAt) {
      try {
        await notificationService.markAsRead(n.id);
      } catch (err) {
        console.error("[HshNotificationBell] mark-read failed", err);
      }
      try { window.dispatchEvent(new CustomEvent("hebrih-notifications-changed")); } catch {}
      await load().catch(() => {});
    }
    setOpen(false);
    const route = (n.route || "").trim();
    if (route) router.push(route as any);
  };

  const unreadBadge = unreadCount > 99 ? "99+" : String(unreadCount);

  const panelContent =
    open && mounted
      ? createPortal(
          <div
            ref={panelRef}
            id="notification-panel"
            className={`${styles.panel} ${dark ? styles.panelDark : styles.panelLight}`}
            role="dialog"
            aria-label={t("Notifications", "Notifications", "الإشعارات")}
            style={panelStyle}
            onMouseDown={(e) => e.stopPropagation()}
            data-theme={dark ? "dark" : "light"}
          >
            <div className={styles.panelHeader}>
              <h3>
                {t("Notifications", "Notifications", "الإشعارات")}
                {unreadCount > 0 && <span className={styles.headerCount}>{unreadBadge}</span>}
              </h3>
              {unreadCount > 0 ? (
                <button type="button" className={styles.markAllButton} onClick={handleMarkAllRead}>
                  {notifLabel("markAllRead", language)}
                </button>
              ) : (
                <span className={styles.headerSpacer} />
              )}
            </div>
            <div className={styles.tabRow} role="tablist" aria-label={t("Notifications", "Notifications", "الإشعارات")}>
              {(["all", "unread", "important"] as PopoverTab[]).map((key) => {
                const count = key === "unread" ? unreadCount : key === "important" ? importantCount : notifications.length;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
                    onClick={() => setTab(key)}
                  >
                    {notifLabel(key, language)}
                    <span className={styles.tabCount}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className={styles.panelContent}>
              {tabItems.length === 0 ? (
                <div className={styles.emptyState}>
                  <Bell size={24} strokeWidth={1.5} aria-hidden="true" />
                  <strong>
                    {tab === "unread"
                      ? notifLabel("emptyUnreadTitle", language)
                      : tab === "important"
                        ? notifLabel("emptyImportantTitle", language)
                        : notifLabel("emptyAllTitle", language)}
                  </strong>
                  <p>
                    {tab === "unread"
                      ? notifLabel("emptyUnreadBody", language)
                      : tab === "important"
                        ? notifLabel("emptyImportantBody", language)
                        : notifLabel("emptyAllBody", language)}
                  </p>
                </div>
              ) : (
                groups.map((g) => (
                  <section key={g.key} className={styles.group} aria-label={notifLabel(g.key, language)}>
                    <h4 className={styles.groupTitle}>{notifLabel(g.key, language)}</h4>
                    <div className={styles.groupList}>
                      {g.items.map((n) => (
                        <NotificationItem key={n.id} notification={n} language={language} onOpen={(item) => void handleItemClick(item)} />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
            <div className={styles.panelFooter}>
              <button type="button" className={styles.viewAllButton} onClick={() => { setOpen(false); router.push("/notifications" as any); }}>
                {notifLabel("viewAll", language)}
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className={styles.container}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.bellButton}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("Notifications", "Notifications", "الإشعارات")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="notification-panel"
        title={t("Notifications", "Notifications", "الإشعارات")}
      >
        <Bell size={18} strokeWidth={2} aria-hidden="true" />
        {unreadCount > 0 && <span className={styles.badge}>{unreadBadge}</span>}
      </button>
      {panelContent}
    </div>
  );
}
