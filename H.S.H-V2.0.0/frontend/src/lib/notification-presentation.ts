/**
 * Single shared presentation model for the desktop notification center
 * (sidebar popover + full notifications page). Both surfaces consume these
 * helpers so filters, grouping, importance, icons and deep links stay
 * identical — no duplicated mapping.
 *
 * Importance is DERIVED (the engine stores severity/type/route and rarely
 * sets priority): a notification is important when it needs a human decision
 * or signals failure. Routine success events stay normal. Critical/red
 * treatment is reserved for severity === "critical" only.
 */
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Banknote,
  Bell,
  ClipboardCheck,
  Package,
  Receipt,
  RefreshCw,
  Settings,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";
import type { Notification } from "../types/entities/notification";

export type NotificationImportance = "normal" | "important";

export function isArchived(n: Notification): boolean {
  return !!(n as any).archivedAt;
}

export function isUnread(n: Notification): boolean {
  return !n.readAt;
}

/** Non-archived only — the authoritative working set for counts and lists. */
export function visibleNotifications(all: Notification[]): Notification[] {
  return all.filter((n) => !isArchived(n));
}

export function getUnreadCount(all: Notification[]): number {
  return visibleNotifications(all).filter(isUnread).length;
}

/**
 * SINGLE importance mapping. Desktop engine types actually emitted:
 * customer_order, task, payment, purchase, sale, expense, transfer, worker,
 * vehicle, inventory, account, sync, system. (No loan/discrepancy/chat types
 * exist on desktop — nothing invented here.)
 *
 * important = needs review/decision or failure:
 * - explicit priority high/urgent (if ever stored)
 * - severity critical (sync failure, out-of-stock, overdue) or warning
 * - customer_order (order awaiting approval)
 */
export function getNotificationImportance(n: Notification): NotificationImportance {
  const stored = (n as any).priority;
  if (stored === "high" || stored === "urgent") return "important";
  if (n.severity === "critical" || n.severity === "warning") return "important";
  if (n.type === "customer_order") return "important";
  return "normal";
}

export function getImportantCount(all: Notification[]): number {
  return visibleNotifications(all).filter((n) => getNotificationImportance(n) === "important").length;
}

/** Consistent vector icon per ACTUAL notification type (suite uses lucide). */
const TYPE_ICONS: Record<string, LucideIcon> = {
  customer_order: ShoppingCart,
  task: ClipboardCheck,
  payment: Banknote,
  purchase: Package,
  sale: Receipt,
  expense: Receipt,
  transfer: ArrowLeftRight,
  worker: ClipboardCheck,
  vehicle: Truck,
  inventory: Package,
  account: Wallet,
  sync: RefreshCw,
  system: Settings,
};

export function getNotificationIcon(n: Notification): LucideIcon {
  return TYPE_ICONS[n.type] ?? Bell;
}

/**
 * True system-failure red: severity critical on sync/system channels only
 * (sync terminal, system faults). Business-actionable criticals (overdue
 * tasks, out-of-stock) stay amber — half the feed must not look like an
 * outage. Single place where "red" is decided.
 */
export function isCriticalAlert(n: Notification): boolean {
  return n.severity === "critical" && (n.type === "sync" || n.type === "system");
}

/** Severity accent for the icon container (info/neutral, never alarmist). */
export function getNotificationTone(n: Notification): "neutral" | "amber" | "red" | "green" {
  if (isCriticalAlert(n)) return "red";
  if (getNotificationImportance(n) === "important") return "amber";
  if (n.severity === "success") return "green";
  return "neutral";
}

/**
 * Small contextual CTA for actionable types only. Routine events
 * (sale/payment/purchase recorded, …) return null — opening the row itself
 * is sufficient. Labels are resolved per language by the caller via
 * notifLabel("review" | "open").
 */
export function getNotificationAction(n: Notification): "review" | "open" | null {
  if (n.type === "customer_order") return "review";
  if (n.type === "task") return "open";
  if (n.type === "sync" && n.severity === "critical") return "open";
  if (n.type === "inventory" && n.severity === "critical") return "open";
  return null;
}

/** Deep link: the stored per-notification route (most specific available). */
export function getNotificationRoute(n: Notification): string | null {
  const route = (n.route || "").trim();
  return route ? route : null;
}

export type DayGroupKey = "today" | "yesterday" | "earlier";

export type DayGroup = {
  key: DayGroupKey;
  items: Notification[];
};

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Groups newest-first items into Today / Yesterday / Earlier (local days).
 * Empty groups are omitted. Input order is preserved within groups.
 */
export function groupNotificationsByDay(items: Notification[]): DayGroup[] {
  const todayStart = startOfDay(Date.now());
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const buckets: Record<DayGroupKey, Notification[]> = { today: [], yesterday: [], earlier: [] };
  for (const n of items) {
    const day = startOfDay(n.createdAt);
    if (day >= todayStart) buckets.today.push(n);
    else if (day >= yesterdayStart) buckets.yesterday.push(n);
    else buckets.earlier.push(n);
  }
  return (Object.keys(buckets) as DayGroupKey[])
    .map((key) => ({ key, items: buckets[key] }))
    .filter((g) => g.items.length > 0);
}

export type NotifLabelKey =
  | "all"
  | "unread"
  | "important"
  | "today"
  | "yesterday"
  | "earlier"
  | "review"
  | "open"
  | "markAllRead"
  | "viewAll"
  | "emptyAllTitle"
  | "emptyAllBody"
  | "emptyUnreadTitle"
  | "emptyUnreadBody"
  | "emptyImportantTitle"
  | "emptyImportantBody";

const LABELS: Record<NotifLabelKey, { en: string; fr: string; ar: string }> = {
  all: { en: "All", fr: "Tous", ar: "الكل" },
  unread: { en: "Unread", fr: "Non lus", ar: "غير مقروءة" },
  important: { en: "Important", fr: "Importants", ar: "المهمة" },
  today: { en: "Today", fr: "Aujourd'hui", ar: "اليوم" },
  yesterday: { en: "Yesterday", fr: "Hier", ar: "أمس" },
  earlier: { en: "Earlier", fr: "Plus tôt", ar: "سابقا" },
  review: { en: "Review", fr: "Examiner", ar: "مراجعة" },
  open: { en: "Open", fr: "Ouvrir", ar: "فتح" },
  markAllRead: { en: "Mark all as read", fr: "Tout marquer comme lu", ar: "تحديد الكل كمقروء" },
  viewAll: { en: "View all notifications", fr: "Voir toutes les notifications", ar: "عرض كل الإشعارات" },
  emptyAllTitle: { en: "No notifications yet", fr: "Aucune notification", ar: "لا توجد إشعارات بعد" },
  emptyAllBody: { en: "New activity will appear here.", fr: "Les nouvelles activités apparaîtront ici.", ar: "ستظهر الأنشطة الجديدة هنا." },
  emptyUnreadTitle: { en: "You're all caught up", fr: "Vous êtes à jour", ar: "أنت على اطلاع دائم" },
  emptyUnreadBody: { en: "No unread notifications.", fr: "Aucune notification non lue.", ar: "لا توجد إشعارات غير مقروءة." },
  emptyImportantTitle: { en: "No important notifications", fr: "Aucune notification importante", ar: "لا توجد إشعارات مهمة" },
  emptyImportantBody: { en: "Requests needing review will appear here.", fr: "Les demandes à examiner apparaîtront ici.", ar: "ستظهر طلبات المراجعة هنا." },
};

export function notifLabel(key: NotifLabelKey, language: string): string {
  const entry = LABELS[key];
  if (language === "fr") return entry.fr;
  if (language === "ar") return entry.ar;
  return entry.en;
}

/** Relative time for compact rows (popover). */
export function formatRelativeTime(createdAt: number, language: string): string {
  const diff = Date.now() - createdAt;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return language === "ar" ? "الآن" : language === "fr" ? "À l'instant" : "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return language === "ar" ? `منذ ${min} د` : language === "fr" ? `il y a ${min} min` : `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return language === "ar" ? `منذ ${hr} س` : language === "fr" ? `il y a ${hr} h` : `${hr} h ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return language === "ar" ? "أمس" : language === "fr" ? "Hier" : "Yesterday";
  return language === "ar" ? `منذ ${days} يوم` : language === "fr" ? `il y a ${days} j` : `${days} d ago`;
}
