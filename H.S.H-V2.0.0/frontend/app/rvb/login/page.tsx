"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS, getDirection } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import { getSavedTheme, applyTheme } from "../../../src/lib/theme";
import { normalizeTag, isValidTag } from "../../../src/types/rvb/rvb-account";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    brandName: "The Kingdom of White Meat",
    abbr: "RVB",
    title: "Sign in to RVB",
    subtitle: "Enter your @tag and password to access the RVB workspace",
    tag: "@Tag",
    tagPlaceholder: "ahmed.b",
    password: "Password",
    show: "Show",
    hide: "Hide",
    signIn: "Sign In",
    signingIn: "Signing in...",
    errors: {
      RVB_TAG_REQUIRED: "Tag is required",
      RVB_PASSWORD_REQUIRED: "Password is required",
      RVB_AUTH_INVALID_CREDENTIALS: "Invalid @tag or password",
      RVB_ACCOUNT_ARCHIVED: "Account is archived",
      RVB_ACCOUNT_DISABLED: "Account is disabled",
      RVB_PASSWORD_NOT_SET: "Password not set — contact manager",
      RVB_AUTH_TEMPORARILY_LOCKED: "Too many attempts — try again in 15 minutes",
      generic: "Sign in failed — please try again",
    },
  },
  fr: {
    brandName: "Le royaume des viandes blanches",
    abbr: "RVB",
    title: "Connexion à RVB",
    subtitle: "Entrez votre @tag et mot de passe pour accéder à l’espace RVB",
    tag: "@Tag",
    tagPlaceholder: "ahmed.b",
    password: "Mot de passe",
    show: "Afficher",
    hide: "Masquer",
    signIn: "Se connecter",
    signingIn: "Connexion...",
    errors: {
      RVB_TAG_REQUIRED: "Tag requis",
      RVB_PASSWORD_REQUIRED: "Mot de passe requis",
      RVB_AUTH_INVALID_CREDENTIALS: "@tag ou mot de passe invalide",
      RVB_ACCOUNT_ARCHIVED: "Compte archivé",
      RVB_ACCOUNT_DISABLED: "Compte désactivé",
      RVB_PASSWORD_NOT_SET: "Mot de passe non configuré — contactez le manager",
      RVB_AUTH_TEMPORARILY_LOCKED: "Trop de tentatives — réessayez dans 15 minutes",
      generic: "Échec de connexion — réessayez",
    },
  },
  ar: {
    brandName: "مملكة اللحوم البيضاء",
    abbr: "RVB",
    title: "تسجيل الدخول إلى RVB",
    subtitle: "أدخل @tag وكلمة المرور للوصول إلى مساحة RVB",
    tag: "@Tag",
    tagPlaceholder: "ahmed.b",
    password: "كلمة المرور",
    show: "إظهار",
    hide: "إخفاء",
    signIn: "تسجيل الدخول",
    signingIn: "جارٍ تسجيل الدخول...",
    errors: {
      RVB_TAG_REQUIRED: "المعرّف مطلوب",
      RVB_PASSWORD_REQUIRED: "كلمة المرور مطلوبة",
      RVB_AUTH_INVALID_CREDENTIALS: "@tag أو كلمة المرور غير صحيحة",
      RVB_ACCOUNT_ARCHIVED: "الحساب مؤرشف",
      RVB_ACCOUNT_DISABLED: "الحساب معطّل",
      RVB_PASSWORD_NOT_SET: "كلمة المرور غير مضبوطة — تواصل مع المدير",
      RVB_AUTH_TEMPORARILY_LOCKED: "محاولات كثيرة — حاول بعد 15 دقيقة",
      generic: "فشل تسجيل الدخول — حاول مجدداً",
    },
  },
};

export default function RvbLoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, login } = useRvbAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [tag, setTag] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const tagInputRef = useRef<HTMLInputElement>(null);
  const pwdInputRef = useRef<HTMLInputElement>(null);
  const submitLockRef = useRef(false);
  const errorId = "rvb-login-error";

  const lang = (settings.language as Language) || "en";
  const t = (TR as any)[lang] ?? TR.en;
  const isRtl = lang === "ar";

  useEffect(() => {
    rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); });
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) setSettings(ce.detail);
      else rvbUiPreferencesService.get().then((s) => { if (s) setSettings(s); });
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h); window.removeEventListener("storage", h); };
  }, []);

  useEffect(() => {
    if (!authLoading && user) {
      if ((user as any).mustChangePassword) router.replace("/rvb/auth/change-password");
      else router.replace("/rvb");
    }
  }, [authLoading, user, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current) return;
    setError("");
    const normalizedTag = normalizeTag(tag);
    if (!normalizedTag) {
      setError(t.errors.RVB_TAG_REQUIRED);
      tagInputRef.current?.focus();
      return;
    }
    if (!isValidTag(normalizedTag)) {
      setError(t.errors.RVB_TAG_REQUIRED);
      tagInputRef.current?.focus();
      return;
    }
    if (!password) {
      setError(t.errors.RVB_PASSWORD_REQUIRED);
      pwdInputRef.current?.focus();
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const account = await login(normalizedTag, password);
      if ((account as any).mustChangePassword) router.replace("/rvb/auth/change-password");
      else router.replace("/rvb");
    } catch (err: any) {
      const code = err?.code || err?.data?.code || "";
      // Do not expose archived/disabled/password-not-set via login UI; map those to generic
      const enumeratedCodes = new Set(["RVB_ACCOUNT_ARCHIVED", "RVB_ACCOUNT_DISABLED", "RVB_PASSWORD_NOT_SET"]);
      const mapped = enumeratedCodes.has(code) ? t.errors.generic : ((t.errors as any)[code] || t.errors.generic);
      setError(mapped);
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  if (authLoading) {
    return (
      <div className={styles.loadingWrap}>
        <Loader2 size={24} className={styles.spinner} />
      </div>
    );
  }

  // Don't flash login if already authenticated (will redirect)
  if (user) {
    return (
      <div className={styles.loadingWrap}>
        <Loader2 size={24} className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden="true">
            <img src="/chicken.jpg" alt="" />
          </div>
          <div className={styles.brandText}>
            <strong className={styles.brandName}>{t.brandName}</strong>
            <span className={styles.brandAbbr}>{t.abbr}</span>
          </div>
        </div>

        <div className={styles.header}>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
        </div>

        <form onSubmit={onSubmit} className={styles.form} noValidate aria-busy={submitting}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="rvb-tag-input">{t.tag}</label>
            <div className={styles.tagField} dir="ltr">
              <span className={styles.tagPrefix} aria-hidden="true">@</span>
              <input
                id="rvb-tag-input"
                name="username"
                value={tag}
                onChange={(e) => { if (error) setError(""); setTag(e.target.value); }}
                placeholder={t.tagPlaceholder}
                dir="ltr"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className={styles.tagInput}
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                ref={tagInputRef}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="rvb-password-input">{t.password}</label>
            <div className={styles.passwordWrap}>
              <input
                id="rvb-password-input"
                name="password"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => { if (error) setError(""); setPassword(e.target.value); }}
                autoComplete="current-password"
                className={styles.input}
                dir="ltr"
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                ref={pwdInputRef}
              />
              <button
                type="button"
                className={styles.showButton}
                onClick={() => {
                  setShowPwd((v) => !v);
                  // Retain focus on password input after toggle
                  requestAnimationFrame(() => pwdInputRef.current?.focus());
                }}
                aria-label={showPwd ? t.hide : t.show}
                aria-pressed={showPwd}
              >
                {showPwd ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                <span>{showPwd ? t.hide : t.show}</span>
              </button>
            </div>
          </div>

          {error && <div id={errorId} className={styles.error} role="alert" aria-live="assertive">{error}</div>}

          <button type="submit" className={styles.submit} disabled={submitting} aria-busy={submitting}>
            {submitting ? <Loader2 size={16} className={styles.spinner} /> : <ShieldCheck size={16} strokeWidth={2} />}
            {submitting ? t.signingIn : t.signIn}
          </button>
        </form>
      </div>
    </div>
  );
}

