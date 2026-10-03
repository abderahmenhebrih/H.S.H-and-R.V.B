import { useAuthStore } from "@/stores/auth-store";

export type Language = "en" | "fr" | "ar";

export function getCurrentLanguage(): Language {
  const acc = useAuthStore.getState().account;
  const l = acc?.preferences?.ui?.language;
  if (l === "fr" || l === "ar" || l === "en") return l;
  return "en";
}

export function formatDate(ms: number | null | undefined, lang?: Language): string {
  if (!ms || typeof ms !== "number") return "-";
  const l = lang || getCurrentLanguage();
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "-";
  try {
    const locale = l === "fr" ? "fr-FR" : l === "ar" ? "ar-DZ" : "en-GB";
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function formatDateTime(ms: number | null | undefined, lang?: Language): string {
  if (!ms) return "-";
  const l = lang || getCurrentLanguage();
  const d = new Date(ms);
  if (isNaN(d.getTime())) return "-";
  try {
    const locale = l === "fr" ? "fr-FR" : l === "ar" ? "ar-DZ" : "en-GB";
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toISOString();
  }
}
