"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck, Loader2, Lock } from "lucide-react";
import { useRvbAuth } from "../../../../src/contexts/RvbAuthContext";
import { settingsService } from "../../../../src/services/settings.service";
import { DEFAULT_SETTINGS, SETTINGS_EVENT } from "../../../../src/lib/settings";
import type { Settings, Language } from "../../../../src/types/settings/settings";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    title: "Change Password",
    subtitle: "You must change your temporary password before continuing",
    current: "Current Password",
    newPwd: "New Password",
    confirm: "Confirm New Password",
    show: "Show",
    hide: "Hide",
    submit: "Change Password",
    submitting: "Changing...",
    hint: "8–128 characters",
    errors: {
      RVB_PASSWORD_REQUIRED: "Password is required",
      RVB_PASSWORD_TOO_SHORT: "Password must be at least 8 characters",
      RVB_PASSWORD_TOO_LONG: "Password must be at most 128 characters",
      RVB_PASSWORD_CONFIRM_MISMATCH: "Passwords do not match",
      RVB_AUTH_INVALID_CREDENTIALS: "Current password is incorrect",
      generic: "Failed to change password",
    },
    success: "Password changed — redirecting...",
  },
  fr: {
    title: "Changer le mot de passe",
    subtitle: "Vous devez changer votre mot de passe temporaire avant de continuer",
    current: "Mot de passe actuel",
    newPwd: "Nouveau mot de passe",
    confirm: "Confirmer",
    show: "Afficher",
    hide: "Masquer",
    submit: "Changer le mot de passe",
    submitting: "Modification...",
    hint: "8–128 caractères",
    errors: {
      RVB_PASSWORD_REQUIRED: "Mot de passe requis",
      RVB_PASSWORD_TOO_SHORT: "Au moins 8 caractères",
      RVB_PASSWORD_TOO_LONG: "Au plus 128 caractères",
      RVB_PASSWORD_CONFIRM_MISMATCH: "Les mots de passe ne correspondent pas",
      RVB_AUTH_INVALID_CREDENTIALS: "Mot de passe actuel incorrect",
      generic: "Échec du changement",
    },
    success: "Mot de passe changé — redirection...",
  },
  ar: {
    title: "تغيير كلمة المرور",
    subtitle: "يجب تغيير كلمة المرور المؤقتة قبل المتابعة",
    current: "كلمة المرور الحالية",
    newPwd: "كلمة المرور الجديدة",
    confirm: "تأكيد كلمة المرور",
    show: "إظهار",
    hide: "إخفاء",
    submit: "تغيير كلمة المرور",
    submitting: "جارٍ التغيير...",
    hint: "8–128 حرفاً",
    errors: {
      RVB_PASSWORD_REQUIRED: "كلمة المرور مطلوبة",
      RVB_PASSWORD_TOO_SHORT: "8 أحرف على الأقل",
      RVB_PASSWORD_TOO_LONG: "128 حرفاً على الأكثر",
      RVB_PASSWORD_CONFIRM_MISMATCH: "كلمتا المرور غير متطابقتين",
      RVB_AUTH_INVALID_CREDENTIALS: "كلمة المرور الحالية غير صحيحة",
      generic: "فشل التغيير",
    },
    success: "تم التغيير — جارٍ التوجيه...",
  },
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, loading, changePassword } = useRvbAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;
  const isRtl = lang === "ar";

  useEffect(() => {
    settingsService.get().then((s) => { if (s) setSettings(s); });
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
      else settingsService.get().then((s) => { if (s) setSettings(s); });
    };
    window.addEventListener(SETTINGS_EVENT, h);
    return () => window.removeEventListener(SETTINGS_EVENT, h);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/rvb/login");
    // If user loaded and mustChangePassword false, redirect to /rvb
    if (!loading && user && !(user as any).mustChangePassword) {
      // Allow staying if user navigated here manually? But spec says mandatory redirect only when mustChange true.
      // If false, don't force; let them stay but redirect after  ? For now, if they are here and no mustChange, redirect to /rvb
      // Only redirect if they were forced? We'll not auto-redirect to avoid loop when voluntarily visiting.
      // So do nothing here.
    }
  }, [loading, user, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!current) { setError(t.errors.RVB_PASSWORD_REQUIRED); return; }
    if (newPwd.length < 8) { setError(t.errors.RVB_PASSWORD_TOO_SHORT); return; }
    if (newPwd.length > 128) { setError(t.errors.RVB_PASSWORD_TOO_LONG); return; }
    if (newPwd !== confirm) { setError(t.errors.RVB_PASSWORD_CONFIRM_MISMATCH); return; }
    setSubmitting(true);
    try {
      await changePassword({ currentPassword: current, newPassword: newPwd, confirmPassword: confirm });
      setSuccess(true);
      setTimeout(() => router.replace("/rvb"), 600);
    } catch (err: any) {
      const code = err?.code || err?.data?.code || "";
      const msg = (t.errors as any)[code] || t.errors.generic;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.loadingWrap}><Loader2 size={24} className={styles.spinner} /></div>;
  }
  if (!user) {
    return <div className={styles.loadingWrap}><Loader2 size={24} className={styles.spinner} /></div>;
  }

  return (
    <div className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
      <div className={styles.card}>
        <div className={styles.icon} aria-hidden="true"><Lock size={20} strokeWidth={2} /></div>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.subtitle}>{t.subtitle}</p>

        <form onSubmit={onSubmit} className={styles.form} noValidate>
          <label className={styles.field}>
            <span className={styles.label}>{t.current}</span>
            <div className={styles.pwdWrap}>
              <input type={showCurrent ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} className={styles.input} dir="ltr" autoComplete="current-password" />
              <button type="button" className={styles.showButton} onClick={() => setShowCurrent((v) => !v)}>{showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}<span>{showCurrent ? t.hide : t.show}</span></button>
            </div>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t.newPwd} <small className={styles.hint}>({t.hint})</small></span>
            <div className={styles.pwdWrap}>
              <input type={showNew ? "text" : "password"} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className={styles.input} dir="ltr" autoComplete="new-password" />
              <button type="button" className={styles.showButton} onClick={() => setShowNew((v) => !v)}>{showNew ? <EyeOff size={16} /> : <Eye size={16} />}<span>{showNew ? t.hide : t.show}</span></button>
            </div>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{t.confirm}</span>
            <div className={styles.pwdWrap}>
              <input type={showConfirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} className={styles.input} dir="ltr" autoComplete="new-password" />
              <button type="button" className={styles.showButton} onClick={() => setShowConfirm((v) => !v)}>{showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}<span>{showConfirm ? t.hide : t.show}</span></button>
            </div>
          </label>

          {error && <div className={styles.error} role="alert">{error}</div>}
          {success && <div className={styles.success} role="status">{t.success}</div>}

          <button type="submit" className={styles.submit} disabled={submitting || success}>
            {submitting ? <Loader2 size={16} className={styles.spinner} /> : <ShieldCheck size={16} strokeWidth={2} />}
            {submitting ? t.submitting : t.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
