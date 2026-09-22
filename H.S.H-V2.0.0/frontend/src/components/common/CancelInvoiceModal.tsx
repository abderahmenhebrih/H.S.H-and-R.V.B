"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { useCircularDeleteCountdown, DELETE_COUNTDOWN_MS } from "../../hooks/useCircularDeleteCountdown";
import styles from "./ProtectedDeleteModal.module.css";
import type { Language } from "../../types/settings/settings";

type Props = {
  isOpen: boolean;
  invoiceNumber?: string;
  language: Language;
  t: Record<string, string>;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
  resetKey?: string | null;
};

export default function CancelInvoiceModal({ isOpen, invoiceNumber, language, t, onCancel, onConfirm, resetKey }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { displaySec, isReady, startRef } = useCircularDeleteCountdown(isOpen, resetKey ?? null);

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setError("");
      setSubmitting(false);
    }
  }, [isOpen, resetKey]);

  if (!isOpen) return null;

  const CIRCLE_R = 28;
  const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_R;
  const dashOffset = CIRCUMFERENCE * (displaySec / 3.5);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError(t.cancellationReasonRequired);
      return;
    }
    if (startRef.current !== null) {
      const elapsed = Date.now() - startRef.current;
      if (elapsed < DELETE_COUNTDOWN_MS) return;
    } else if (!isReady) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(reason.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : t.cancelFailed);
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (submitting) return;
    onCancel();
  };

  const eyebrow = t.permanentAction;
  const waitingLabel = t.confirmAvailableIn ?? (language==="fr"?"Confirmation disponible dans": language==="ar"?"التأكيد متاح بعد":"Confirm available in");

  return (
    <div className={styles.backdrop} onClick={handleCancel}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="cancel-invoice-title" onClick={(e) => e.stopPropagation()}>
        <div className={styles.warningIcon} aria-hidden="true">
          <AlertTriangle size={20} strokeWidth={2} />
        </div>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h2 id="cancel-invoice-title" className={styles.title}>{t.cancelTitle}</h2>
        {invoiceNumber && <p className={styles.entityName}>{invoiceNumber}</p>}
        <p className={styles.description}>{t.cancelDesc}</p>
        <div className={styles.warningBox}>{t.cancelWarning}</div>

        <div style={{ marginTop: 16, textAlign: "start" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            <span>{t.cancellationReason} <small style={{ color: "var(--danger)", fontWeight: 800 }}>*</small></span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.cancellationReasonPlaceholder}
              rows={3}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--panel-hover)", color: "var(--text)", fontSize: 13, resize: "vertical" }}
              disabled={submitting}
            />
          </label>
          {error && <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "var(--danger-soft)", border: "1px solid var(--danger-ring)", color: "var(--danger)", fontSize: 12, fontWeight: 600 }}>{error}</div>}
        </div>

        <div className={styles.circularCountdown} aria-live="polite">
          <div className={styles.circleWrapper} aria-hidden="true">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r={CIRCLE_R} className={styles.circleTrack} />
              <circle cx="32" cy="32" r={CIRCLE_R} className={styles.circleProgress} style={{ strokeDasharray: `${CIRCUMFERENCE}`, strokeDashoffset: `${dashOffset}` }} />
            </svg>
            <span className={styles.circleText}>{displaySec > 0 ? displaySec.toFixed(1) : "0.0"}</span>
          </div>
          <span className={styles.circleLabel}>{isReady ? t.confirmCancel : waitingLabel}</span>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={handleCancel} disabled={submitting}>{t.cancel}</button>
          <button type="button" className={styles.deleteButton} onClick={handleConfirm} disabled={!isReady || submitting || !reason.trim()}>
            <Ban size={14} strokeWidth={2} aria-hidden="true" />
            {submitting ? t.cancelling : t.confirmCancel}
          </button>
        </div>
      </section>
    </div>
  );
}
