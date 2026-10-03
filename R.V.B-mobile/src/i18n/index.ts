import { useAuthStore } from "@/stores/auth-store";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import ar from "./locales/ar.json";

const locales: Record<string, typeof en> = { en, fr, ar };

export type Language = "en" | "fr" | "ar";

export function getCurrentLanguage(): Language {
  const account = useAuthStore.getState().account;
  const lang = account?.preferences?.ui?.language;
  if (lang && ["en", "fr", "ar"].includes(lang)) return lang as Language;
  return "en";
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
