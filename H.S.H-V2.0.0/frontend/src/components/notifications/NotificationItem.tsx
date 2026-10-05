"use client";

import { Star } from "lucide-react";
import type { Notification } from "../../types/entities/notification";
import {
  formatRelativeTime,
  getNotificationAction,
  getNotificationIcon,
  getNotificationImportance,
  getNotificationTone,
  isCriticalAlert,
  isUnread,
  notifLabel,
} from "../../lib/notification-presentation";
import { formatTimestampToDisplay } from "../../lib/date-format";
import styles from "./NotificationItem.module.css";

type Props = {
  notification: Notification;
  language: string;
  /** Compact relative time ("1h ago") always shown; full page also gets DD/MM/YYYY. */
  showDetailDate?: boolean;
  /** "popover" = compact feed row; "page" = richer center-stage row with
      integrated date/CTA metadata line. Logic is never forked. */
  variant?: "popover" | "page";
  /** Row activation = mark read + deep-link navigate (CTA cue included). */
  onOpen: (n: Notification) => void;
};

/**
 * Shared notification row for the sidebar popover and the full page.
 * Button semantics (keyboard accessible), visible focus, unread dot +
 * stronger treatment, amber edge for important (red only when critical),
 * sparse contextual CTA. Importance is textually exposed via aria-label —
 * never color-only.
 */
export default function NotificationItem({ notification: n, language, showDetailDate = false, variant = "popover", onOpen }: Props) {
  const unread = isUnread(n);
  const important = getNotificationImportance(n) === "important";
  const critical = isCriticalAlert(n);
  const Icon = getNotificationIcon(n);
  const tone = getNotificationTone(n);
  const action = getNotificationAction(n);
  const page = variant === "page";

  const ariaBits = [n.title, n.message];
  if (unread) ariaBits.push(language === "fr" ? "non lu" : language === "ar" ? "غير مقروء" : "unread");
  if (important) ariaBits.push(language === "fr" ? "important" : language === "ar" ? "مهم" : "important");

  return (
    <button
      type="button"
      className={`${styles.item} ${page ? styles.itemPage : ""} ${unread ? styles.itemUnread : ""} ${important && !critical ? styles.itemImportant : ""} ${critical ? styles.itemCritical : ""}`}
      onClick={() => onOpen(n)}
      aria-label={ariaBits.filter(Boolean).join(" — ")}
    >
      <span className={styles.iconBox} data-tone={tone} aria-hidden="true">
        <Icon size={page ? 18 : 16} strokeWidth={2} />
      </span>
      <span className={styles.body}>
        <span className={styles.topRow}>
          <span className={styles.title}>{n.title}</span>
          <span className={styles.time}>{formatRelativeTime(n.createdAt, language)}</span>
          {unread && <span className={styles.unreadDot} aria-hidden="true" />}
          {important && (
            <span className={styles.importantMark} aria-label={language === "fr" ? "Notification importante" : language === "ar" ? "إشعار مهم" : "Important notification"}>
              <Star size={12} strokeWidth={2.5} aria-hidden="true" />
            </span>
          )}
        </span>
        <span className={styles.detail}>{n.message}</span>
        {(showDetailDate || (page && action)) && (
          <span className={styles.metaRow}>
            {showDetailDate && <span className={styles.detailDate}>{formatTimestampToDisplay(n.createdAt)}</span>}
            {page && action && (
              /* Visual cue only — the row button itself performs the action,
                 keeping a single keyboard tab stop per notification. */
              <span className={styles.actionHint} aria-hidden="true">
                {notifLabel(action, language)} →
              </span>
            )}
          </span>
        )}
        {!page && action && (
          <span className={styles.actionRow}>
            <span className={styles.actionButton} aria-hidden="true">
              {notifLabel(action, language)}
            </span>
          </span>
        )}
      </span>
    </button>
  );
}
