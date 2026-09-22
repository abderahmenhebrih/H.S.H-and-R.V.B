"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, X } from "lucide-react";
import { notificationService } from "../../services/notification.service";
import { useDbSync } from "../../hooks/useDbSync";
import type { Notification } from "../../types/entities/notification";
import styles from "./NotificationBell.module.css";

function formatRelativeTime(createdAt: number, language: string): string {
  const now = Date.now();
  const diff = now - createdAt;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return language === "ar" ? "الآن" : language === "fr" ? "À l'instant" : "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return language === "ar" ? `منذ ${min} د` : language === "fr" ? `il y a ${min} min` : `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return language === "ar" ? `منذ ${hr} س` : language === "fr" ? `il y a ${hr} h` : `${hr} h ago`;
  const days = Math.floor(hr / 24);
  return language === "ar" ? `منذ ${days} يوم` : language === "fr" ? `il y a ${days} j` : `${days} d ago`;
}

const typeIcons: Record<string, string> = {
  customer_order: "🛒",
  task: "✅",
  payment: "💳",
  purchase: "📦",
  sale: "💰",
  expense: "🧾",
  transfer: "↔️",
  worker: "👷",
  vehicle: "🚚",
  inventory: "📊",
  account: "🏦",
  sync: "🔄",
  system: "⚙️",
};

export default function NotificationBell({ language = "en", dark = false }: { language?: string; dark?: boolean }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const load = async () => {
    try {
      // Show recent non-archived, unread first for quick preview
      const all = await notificationService.getAll();
      const filtered = all.filter((n: any) => !(n as any).archivedAt).sort((a, b) => {
        const aUnread = !a.readAt ? 0 : 1;
        const bUnread = !b.readAt ? 0 : 1;
        if (aUnread !== bUnread) return aUnread - bUnread;
        return b.createdAt - a.createdAt;
      }).slice(0, 5);
      setNotifications(filtered);
      const count = all.filter((n: any) => !n.readAt && !(n as any).archivedAt).length;
      setUnreadCount(count);
    } catch (err) {
      console.error("[NotificationBell] load failed", err);
    }
  };

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
    window.addEventListener("rvb:notification" as any, h);
    return () => {
      window.removeEventListener("hebrih-notifications-changed", h);
      window.removeEventListener("rvb:notification" as any, h);
    };
  }, []);

  // Position panel via getBoundingClientRect when open (portal)
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

    // LTR: align right edge with button group, RTL: mirror
    const isRtl = document.documentElement.dir === "rtl";
    if (isRtl) {
      left = Math.max(12, rect.left);
      // Ensure not overflow right
      if (left + panelWidth > viewportWidth - 12) {
        left = Math.max(12, viewportWidth - panelWidth - 12);
      }
    } else {
      // Prefer right-aligned to button
      right = Math.max(12, viewportWidth - rect.right);
      // If not enough space on right, shift left
      const estimatedLeft = rect.right - panelWidth;
      if (estimatedLeft < 12) {
        left = 12;
        right = undefined;
      }
    }

    // Ensure panel fits vertically, if not enough space below, show above
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
      // Both set, prefer left
      style.right = undefined;
    }
    // Mobile: full width
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
      if (
        containerRef.current &&
        containerRef.current.contains(target)
      ) {
        return;
      }
      if (panelRef.current && panelRef.current.contains(target)) {
        return;
      }
      setOpen(false);
    };
    // Use mousedown to catch before click, but ensure Bell click doesn't immediately close
    // We add listener after a microtask to avoid same-click close
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

  // realtime socket for rvb notifications
  useEffect(() => {
    try {
      const { connectChatSocket } = require("../../services/chat-socket.service") as any;
      const sock = connectChatSocket?.();
      if (!sock) return;
      const onRvbNotif = () => void load();
      sock.on("rvb:notification", onRvbNotif);
      return () => sock.off("rvb:notification", onRvbNotif);
    } catch {}
  }, []);

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
    if (!n.readAt) {
      await notificationService.markAsRead(n.id);
      try { window.dispatchEvent(new CustomEvent("hebrih-notifications-changed")); } catch {}
    }
    setOpen(false);
    if (n.route) {
      router.push(n.route);
    }
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
              <h3>{t("Notifications", "Notifications", "الإشعارات")}</h3>
              {unreadCount > 0 ? (
                <button type="button" className={styles.markAllButton} onClick={handleMarkAllRead}>
                  {t("Mark all as read", "Tout marquer comme lu", "تحديد الكل كمقروء")}
                </button>
              ) : (
                <span className={styles.headerSpacer} />
              )}
            </div>

            <div className={styles.panelContent}>
              {notifications.length === 0 ? (
                <div className={styles.emptyState}>
                  <Bell size={24} strokeWidth={1.5} aria-hidden="true" />
                  <strong>{t("No notifications", "Aucune notification", "لا توجد إشعارات")}</strong>
                  <p>{t("You're all caught up.", "Vous êtes à jour.", "أنت على اطلاع دائم.")}</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`${styles.item} ${!n.readAt ? styles.unread : ""}`}
                    onClick={() => handleItemClick(n)}
                  >
                    <span className={styles.itemIcon} aria-hidden="true">
                      {typeIcons[n.type] ?? "•"}
                    </span>
                    <span className={styles.itemText}>
                      <strong className={styles.itemTitle}>{n.title}</strong>
                      <span className={styles.itemMessage}>{n.message}</span>
                      <small className={styles.itemTime}>{formatRelativeTime(n.createdAt, language)}</small>
                    </span>
                    {!n.readAt && <span className={styles.unreadDot} aria-hidden="true" />}
                  </button>
                ))
              )}
            </div>

            <div className={styles.panelFooter}>
              <button type="button" className={styles.viewAllButton} onClick={() => { setOpen(false); const isRvb = window.location.pathname.startsWith("/rvb"); router.push(isRvb ? "/rvb/notifications" as any : "/notifications" as any); }}>
                {t("View all notifications", "Voir toutes les notifications", "عرض كل الإشعارات")}
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
