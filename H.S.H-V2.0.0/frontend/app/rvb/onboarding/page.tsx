"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Image as ImageIcon, Check, ShieldCheck } from "lucide-react";
import { useRvbAuth } from "../../../src/contexts/RvbAuthContext";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "@/src/services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS } from "../../../src/lib/settings";
import type { Settings, Language } from "../../../src/types/settings/settings";
import styles from "./page.module.css";

const TR: Record<Language, any> = {
  en: {
    title: "Complete your profile",
    subtitle: "Upload a profile picture to finish onboarding. Image will be cropped to 512x512 and compressed to under 200KB.",
    upload: "Choose photo",
    preview: "Preview",
    submit: "Complete onboarding",
    submitting: "Saving...",
    logout: "Log out",
    errors: {
      required: "Profile picture is required",
      tooLarge: "Image still too large after compression — try a smaller photo",
      invalid: "Invalid image file",
      generic: "Failed to complete onboarding",
    },
    success: "Profile completed — redirecting...",
    hint: "512×512 JPEG, <200KB, square crop",
  },
  fr: {
    title: "Complétez votre profil",
    subtitle: "Téléchargez une photo de profil pour terminer l'intégration. L'image sera recadrée 512x512 et compressée <200KB.",
    upload: "Choisir photo",
    preview: "Aperçu",
    submit: "Terminer l'intégration",
    submitting: "Enregistrement...",
    logout: "Se déconnecter",
    errors: {
      required: "Photo requise",
      tooLarge: "Image trop volumineuse — essayez une plus petite",
      invalid: "Fichier image invalide",
      generic: "Échec de l'intégration",
    },
    success: "Profil terminé — redirection...",
    hint: "512×512 JPEG, <200KB, recadrage carré",
  },
  ar: {
    title: "أكمل ملفك الشخصي",
    subtitle: "حمّل صورة الملف الشخصي لإنهاء الإعداد. سيتم قص الصورة 512×512 وضغطها لأقل من 200KB.",
    upload: "اختر صورة",
    preview: "معاينة",
    submit: "إكمال الإعداد",
    submitting: "جارٍ الحفظ...",
    logout: "تسجيل الخروج",
    errors: {
      required: "الصورة مطلوبة",
      tooLarge: "الصورة كبيرة — جرّب صورة أصغر",
      invalid: "ملف صورة غير صالح",
      generic: "فشل الإكمال",
    },
    success: "تم الإكمال — جارٍ التوجيه...",
    hint: "512×512 JPEG، <200KB، قص مربع",
  },
};

function canvasProcess(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("invalid"));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new window.Image();
      img.onerror = () => reject(new Error("invalid"));
      img.onload = () => {
        const w = img.width;
        const h = img.height;
        if (!w || !h) { reject(new Error("invalid")); return; }
        const size = Math.min(w, h);
        const sx = (w - size) / 2;
        const sy = (h - size) / 2;
        const trySizes = [512, 384, 256];
        const tryQualities = [0.85, 0.7, 0.55, 0.4];
        for (const canvasSize of trySizes) {
          for (const q of tryQualities) {
            const canvas = document.createElement("canvas");
            canvas.width = canvasSize;
            canvas.height = canvasSize;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvasSize, canvasSize);
            ctx.drawImage(img, sx, sy, size, size, 0, 0, canvasSize, canvasSize);
            const out = canvas.toDataURL("image/jpeg", q);
            if (out.length < 200000) {
              resolve(out);
              return;
            }
          }
        }
        // fallback smallest
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("invalid")); return; }
        ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
        const out = canvas.toDataURL("image/jpeg", 0.5);
        if (out.length < 250000) resolve(out);
        else reject(new Error("tooLarge"));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading, completeOnboarding, logout } = useRvbAuth();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [preview, setPreview] = useState<string | null>(null);
  const [compressed, setCompressed] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h as any);
    return () => window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h as any);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/rvb/login");
  }, [loading, user, router]);

  if (loading) {
    return <div className={styles.loadingWrap}><Loader2 size={24} className={styles.spinner} /></div>;
  }
  if (!user) {
    return <div className={styles.loadingWrap}><Loader2 size={24} className={styles.spinner} /></div>;
  }
  // If mustChangePassword, guard will redirect to change-password, but double check
  if ((user as any).mustChangePassword) {
    return <div className={styles.loadingWrap}><Loader2 size={24} className={styles.spinner} /></div>;
  }
  if ((user as any).onboardingStatus === "complete") {
    return <div className={styles.loadingWrap}><Loader2 size={24} className={styles.spinner} /></div>;
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    if (!file.type.startsWith("image/")) {
      setError(t.errors.invalid);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      // still try but warn? we compress anyway, but reject huge
    }
    try {
      const out = await canvasProcess(file);
      setPreview(out);
      setCompressed(out);
    } catch (err: any) {
      const msg = err?.message === "tooLarge" ? t.errors.tooLarge : t.errors.invalid;
      setError(msg);
      setPreview(null);
      setCompressed(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!compressed) {
      setError(t.errors.required);
      return;
    }
    if (compressed.length > 250000) {
      setError(t.errors.tooLarge);
      return;
    }
    setSubmitting(true);
    try {
      await completeOnboarding(compressed);
      setSuccess(true);
      setTimeout(() => router.replace("/rvb"), 600);
    } catch (err: any) {
      const code = err?.code || err?.data?.code || "";
      const msg = (t.errors as any)[code] || t.errors.generic;
      setError(msg + (err?.message ? ` — ${err.message}` : ""));
    } finally {
      setSubmitting(false);
    }
  };

  const onLogout = async () => {
    await logout();
    router.replace("/rvb/login");
  };

  return (
    <div className={styles.page} dir={isRtl ? "rtl" : "ltr"}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.icon} aria-hidden="true"><ShieldCheck size={20} /></div>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
          <small className={styles.hint}>{t.hint}</small>
        </div>

        <form onSubmit={onSubmit} className={styles.form} noValidate>
          <div className={styles.previewWrap}>
            <div className={styles.avatarPreview} aria-hidden="true">
              {preview ? <img src={preview} alt="" className={styles.avatarImg} /> : <ImageIcon size={32} strokeWidth={1.5} />}
            </div>
            <span className={styles.previewLabel}>{t.preview} {preview ? `· ${(compressed?.length ? Math.round(compressed.length/1024) : 0)}KB` : ""}</span>
          </div>

          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFileChange} />
          <button type="button" className={styles.secondaryButton} onClick={() => fileRef.current?.click()} disabled={submitting}>
            <ImageIcon size={16} /> {t.upload}
          </button>

          {error && <div className={styles.error} role="alert">{error}</div>}
          {success && <div className={styles.success} role="status">{t.success}</div>}

          <button type="submit" className={styles.submit} disabled={submitting || !compressed || success}>
            {submitting ? <Loader2 size={16} className={styles.spinner} /> : <Check size={16} />}
            {submitting ? t.submitting : t.submit}
          </button>

          <button type="button" className={styles.ghostButton} onClick={onLogout} disabled={submitting}>
            {t.logout}
          </button>
        </form>
      </div>
    </div>
  );
}

