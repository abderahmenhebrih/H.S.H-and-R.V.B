import { useAuthStore } from "@/stores/auth-store";
import { getPreLoginLanguage, usePreLoginLanguage } from "./pre-login-language";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";

const locales: Record<string, typeof en> = { en, fr, ar };

export type Language = "en" | "fr" | "ar";

function resolveAccountLanguage(): Language | null {
  const account = useAuthStore.getState().account;
  const lang = account?.preferences?.ui?.language;
  if (lang && ["en", "fr", "ar"].includes(lang)) return lang as Language;
  return null;
}

// Precedence: authenticated account preference (authoritative) → pre-login
// selection (login screen, persisted locally) → English default.
export function getCurrentLanguage(): Language {
  return resolveAccountLanguage() ?? getPreLoginLanguage();
}

export function t(key: string, fallback?: string): string {
  const lang = getCurrentLanguage();
  const dict = locales[lang] || en;
  const parts = key.split(".");
  let cur: any = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return fallback || key;
  }
  return typeof cur === "string" ? cur : fallback || key;
}

export function isRTL(lang?: Language): boolean {
  const l = lang || getCurrentLanguage();
  return l === "ar";
}

// Reactive language binding. Canonical preference is the account's
// server-persisted ui.language (restored on boot via session restore,
// updated immediately by Settings), falling back to the pre-login selection
// (login screen, persisted locally), then English. The account preference is
// always authoritative once present — the pre-login value never overwrites it.
// Components MUST read labels through this hook (not the bare t() helper)
// so a language switch rerenders them instantly with no restart.
export function useLanguage(): {
  lang: Language;
  t: (key: string, fallback?: string) => string;
  isRTL: boolean;
} {
  const stored = useAuthStore((s) => s.account?.preferences?.ui?.language);
  const { lang: preLogin } = usePreLoginLanguage();
  const accountLang: Language | null =
    typeof stored === "string" && ["en", "fr", "ar"].includes(stored) ? (stored as Language) : null;
  const lang: Language = accountLang ?? preLogin ?? "en";
  const dict = locales[lang] || en;
  const translate = (key: string, fallback?: string): string => {
    const parts = key.split(".");
    let cur: any = dict;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) cur = cur[p];
      else return fallback || key;
    }
    return typeof cur === "string" ? cur : fallback || key;
  };
  return { lang, t: translate, isRTL: lang === "ar" };
}
