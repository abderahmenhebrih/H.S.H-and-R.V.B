"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { useCircularDeleteCountdown } from "../../hooks/useCircularDeleteCountdown";
import styles from "./ProtectedDeleteModal.module.css";
import type { Language } from "../../types/settings/settings";

type Props = {
  isOpen: boolean;
  title: string;
  entityName?: string;
  description?: string;
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
  deletingLabel?: string;
  isDeleting?: boolean;
  eyebrowLabel?: string;
  countdownWaitingLabel?: string;
  /** Optional UI language for built-in English/French/Arabic defaults. */
  language?: Language | string;
  onCancel: () => void;
  onConfirm: () => void;
  resetKey?: string | null;
};

function resolveLang(language: Language | string | undefined): Language {
  return language === "ar" || language === "fr" || language === "en" ? language : "en";
}

export default function ProtectedDeleteModal({
  isOpen,
  title,
  entityName,
  description,
  warning,
  confirmLabel,
  cancelLabel,
  deletingLabel,
  eyebrowLabel,
  countdownWaitingLabel,
  language = "en",
  isDeleting = false,
  onCancel,
  onConfirm,
  resetKey,
}: Props) {
  const { displaySec, isReady, startRef } = useCircularDeleteCountdown(
    isOpen,
    resetKey ?? null,
  );

  if (!isOpen) return null;

  const lang = resolveLang(language);
  const resolvedCancelLabel =
    cancelLabel ?? (lang === "fr" ? "Annuler" : lang === "ar" ? "إلغاء" : "Cancel");
  const resolvedDeletingLabel =
    deletingLabel ?? (lang === "fr" ? "Suppression..." : lang === "ar" ? "جارٍ الحذف..." : "Deleting...");
  const resolvedEyebrow =
    eyebrowLabel ?? (lang === "fr" ? "ACTION PERMANENTE" : lang === "ar" ? "إجراء دائم" : "PERMANENT ACTION");
  const resolvedCountdownWaiting =
    countdownWaitingLabel ??
    (lang === "fr" ? "Confirmer la suppression" : lang === "ar" ? "تأكيد الحذف" : "Confirm deletion");

  const CIRCLE_R = 28;
  const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_R;
  // purchases uses offset = circumference * (remaining / 3.5), so at 3.5 offset=circ (empty), at 0 offset=0 (full)
  const remainingSec = displaySec;
  const dashOffset = CIRCUMFERENCE * (remainingSec / 3.5);

  const handleConfirm = () => {
    // double-check elapsed time using startRef, not just display state
    if (startRef.current !== null) {
      const elapsed = Date.now() - startRef.current;
      if (elapsed < 3500) return;
    } else if (!isReady) {
      return;
    }
    onConfirm();
  };

  const handleCancel = () => {
    if (isDeleting) return;
    onCancel();
  };

  return (
    <div className={styles.backdrop}>
      <section
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="protected-delete-title"
      >
        <div className={styles.warningIcon} aria-hidden="true">
          <AlertTriangle size={20} strokeWidth={2} />
        </div>

        <span className={styles.eyebrow}>{resolvedEyebrow}</span>

        <h2 id="protected-delete-title" className={styles.title}>
          {title}
        </h2>

        {entityName ? (
          <p className={styles.entityName}>{entityName}</p>
        ) : null}

        {description ? (
          <p className={styles.description}>{description}</p>
        ) : null}

        {warning ? <div className={styles.warningBox}>{warning}</div> : null}

        <div className={styles.circularCountdown} aria-live="polite">
          <div className={styles.circleWrapper} aria-hidden="true">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle
                cx="32"
                cy="32"
                r={CIRCLE_R}
                className={styles.circleTrack}
              />
              <circle
                cx="32"
                cy="32"
                r={CIRCLE_R}
                className={styles.circleProgress}
                style={{
                  strokeDasharray: `${CIRCUMFERENCE}`,
                  strokeDashoffset: `${dashOffset}`,
                }}
              />
            </svg>
            <span className={styles.circleText}>
              {remainingSec > 0 ? remainingSec.toFixed(1) : "0.0"}
            </span>
          </div>
          <span className={styles.circleLabel}>
            {isReady ? confirmLabel : resolvedCountdownWaiting}
          </span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={handleCancel}
            disabled={isDeleting}
          >
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            className={styles.deleteButton}
            onClick={handleConfirm}
            disabled={!isReady || isDeleting}
          >
            <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
            {isDeleting ? resolvedDeletingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
