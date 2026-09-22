"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { rvbNotificationService } from "../../services/rvb-notification.service";
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

export default function RvbNotificationBell({ language = "en", dark = false }: { language?: string; dark?: boolean }) {
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
      const data = await rvbNotificationService.list({ status: "all", limit: 5 } as any).catch(() => null as any);
      if (data && Array.isArray(data.notifications)) {
        const filtered = (data.notifications as any[]).slice(0, 5);
        setNotifications(filtered as any);
        setUnreadCount(data.unreadCount ?? filtered.filter((n: any) => !n.readAt).length);
        return;
      }
      const countData = await rvbNotificationService.count().catch(() => ({ unreadCount: 0 } as any));
      setUnreadCount(countData.unreadCount ?? 0);
    } catch (err) {
      console.error("[RvbNotificationBell] load failed", err);
    }
  };

  useEffect(() => {
    setMounted(true);
    void load();
  }, []);

  useEffect(() => {
    const h = () => void load();
    window.addEventListener("hebrih-rvb-notifications-changed", h);
    window.addEventListener("rvb:notification" as any, h);
    return () => {
      window.removeEventListener("hebrih-rvb-notifications-changed", h);
      window.removeEventListener("rvb:notification" as any, h);
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
    try { await rvbNotificationService.markAllRead(); } catch {}
    try { window.dispatchEvent(new CustomEvent("hebrih-rvb-notifications-changed")); } catch {}
    await load();
  };

  const handleItemClick = async (n: Notification) => {
    if (!n.readAt) {
      try { await rvbNotificationService.markRead(n.id); } catch {}
      try { window.dispatchEvent(new CustomEvent("hebrih-rvb-notifications-changed")); } catch {}
    }
    setOpen(false);
    if (n.route) router.push(n.route);
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
                    <span className={styles.itemIcon} aria-hidden="true">{typeIcons[n.type] ?? "•"}</span>
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
              <button type="button" className={styles.viewAllButton} onClick={() => { setOpen(false); router.push("/rvb/notifications" as any); }}>
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
