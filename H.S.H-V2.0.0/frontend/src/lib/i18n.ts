import type { Language } from "../types/settings/settings";

export type Trilingual<T> = Record<Language, T>;

/** Validate a runtime value as a supported language; fall back to English. */
export function resolveLanguage(value: unknown): Language {
  return value === "ar" || value === "fr" || value === "en" ? value : "en";
}

/** True when the language requires an RTL document direction. */
export function isRtlLanguage(language: Language): boolean {
  return language === "ar";
}

/** BCP-47 locale tag for Intl formatting. Latin digits are forced for Arabic. */
export function localeForLanguage(language: Language): string {
  if (language === "ar") return "ar-DZ-u-nu-latn";
  if (language === "fr") return "fr-FR";
  return "en-GB";
}

/**
 * Safe dictionary accessor. Returns the requested language table, falling
 * back to English at runtime, and warns in development when a language table
 * or key is missing. English fallback is an emergency safety net — the
 * parity checker (scripts/check-i18n-parity.ts) still fails the build when
 * French or Arabic coverage is incomplete.
 */
export function pickLanguage<T extends Record<string, unknown>>(
  dict: Record<Language, T> | Record<string, T>,
  language: Language,
  context?: string,
): T {
  const table = (dict as Record<string, T>)[language] ?? (dict as Record<string, T>).en;
  if (process.env.NODE_ENV !== "production" && !(language in (dict as object))) {
    console.warn(`[i18n] missing "${language}" table${context ? ` in ${context}` : ""}; fell back to English.`);
  }
  return table;
}

/** Per-key lookup with English fallback + dev warning. */
export function tKey<T extends Record<string, unknown>, K extends keyof T & string>(
  dict: Record<Language, T>,
  language: Language,
  key: K,
  context?: string,
): T[K] {
  const table = (dict as Record<string, T>)[language];
  const value = table?.[key as string] ?? (dict.en as T)[key];
  if (process.env.NODE_ENV !== "production" && (table == null || !(key in table))) {
    console.warn(`[i18n] missing key "${key}" for "${language}"${context ? ` in ${context}` : ""}; fell back to English.`);
  }
  return value as T[K];
}

/** Language-aware number formatting (presentation only, never rounds accounts). */
export function formatNumberForLanguage(value: number, language: Language, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(localeForLanguage(language), { numberingSystem: "latn", ...options }).format(value);
  } catch {
    return new Intl.NumberFormat("en-GB", options).format(value);
  }
}

/**
 * Map a thrown service/backend error to a localized user-facing message.
 * - Known stable codes (e.g. SUPPLIER_NOT_FOUND, INVOICE_DATE_INVALID) are
 *   resolved through the provided per-language map.
 * - Human English sentences thrown by legacy services are matched against
 *   known patterns when an exact code is unavailable.
 * - Anything else resolves to the localized generic message; the raw message
 *   is preserved in the console for diagnostics and never shown to users.
 */
export function localizeError(
  err: unknown,
  language: Language,
  codeMap?: Record<string, Trilingual<string>>,
  generic?: Trilingual<string>,
): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const fallbackGeneric =
    generic?.[language] ??
    generic?.en ??
    (language === "ar" ? "حدث خطأ غير متوقع. حاول مرة أخرى." : language === "fr" ? "Une erreur inattendue s'est produite. Réessayez." : "An unexpected error occurred. Please try again.");
  if (!raw) return fallbackGeneric;
  if (codeMap) {
    // Exact match first (stable codes such as SUPPLIER_NOT_FOUND).
    const exact = codeMap[raw];
    if (exact) return exact[language] ?? exact.en;
    // Prefix match for codes with detail suffixes (e.g. "INCOMING_INVOICE_DUPLICATE: ...").
    for (const [code, table] of Object.entries(codeMap)) {
      if (raw === code || raw.startsWith(`${code}:`) || raw.startsWith(`${code} `)) {
        return table[language] ?? table.en;
      }
    }
    // Legacy human-sentence matching for known validation messages.
    const legacy = matchLegacyErrorMessage(raw);
    if (legacy && codeMap[legacy]) return codeMap[legacy][language] ?? codeMap[legacy].en;
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[i18n] unmapped error surfaced as generic (${language}):`, raw);
  }
  return fallbackGeneric;
}

/** Legacy English sentences thrown by services → stable code mapping. */
function matchLegacyErrorMessage(message: string): string | null {
  const m = message.trim();
  if (m === "Customer name is required.") return "CUSTOMER_NAME_REQUIRED";
  if (m === "Customer phone is required.") return "CUSTOMER_PHONE_REQUIRED";
  if (m.startsWith("Invalid phone number")) return "CUSTOMER_PHONE_INVALID";
  if (m === "Customer type is required.") return "CUSTOMER_TYPE_REQUIRED";
  if (m === "A customer with this name already exists.") return "CUSTOMER_DUPLICATE";
  if (m === "A bank account with this name already exists.") return "ACCOUNT_DUPLICATE";
  if (m === "Initial balance must be a finite number >= 0.") return "ACCOUNT_BALANCE_INVALID";
  if (m === "Expense amount must be greater than zero.") return "EXPENSE_AMOUNT_INVALID";
  if (m === "Payment amount must be a finite number greater than zero.") return "PAYMENT_AMOUNT_INVALID";
  if (m === "Payment date must be a valid finite timestamp.") return "PAYMENT_DATE_INVALID";
  if (m === "Title required") return "OFFICE_TITLE_REQUIRED";
  if (m === "Title too long") return "OFFICE_TITLE_TOO_LONG";
  if (m === "Invalid type") return "OFFICE_TYPE_INVALID";
  if (m.startsWith("Content too large")) return "OFFICE_CONTENT_TOO_LARGE";
  if (m === "Invalid linkedEntities" || m === "Invalid linked entity") return "OFFICE_LINK_INVALID";
  if (m === "Injury equation name is required.") return "INJURY_NAME_REQUIRED";
  if (m === "Injury equation is required.") return "INJURY_EQUATION_REQUIRED";
  if (m.startsWith("Failed to load printers")) return "PRINT_LOAD_FAILED";
  if (m.startsWith("Print failed") || m === "Print job failed.") return "PRINT_FAILED";
  if (m.startsWith("PDF generation failed")) return "PDF_FAILED";
  return null;
}

/** Shared localized generic error text (used when a page has no specific map). */
export const GENERIC_ERROR: Trilingual<string> = {
  en: "An unexpected error occurred. Please try again.",
  fr: "Une erreur inattendue s'est produite. Réessayez.",
  ar: "حدث خطأ غير متوقع. حاول مرة أخرى.",
};

/** Shared localized loading text. */
export const LOADING_TEXT: Trilingual<string> = {
  en: "Loading…",
  fr: "Chargement…",
  ar: "جارٍ التحميل…",
};
