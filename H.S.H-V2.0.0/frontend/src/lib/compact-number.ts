/**
 * Compact letter-based formatting for SUMMARY / KPI CARDS only.
 *
 * Deterministic application output (never browser-locale suffixes):
 *   k = thousand, M = million, B = billion — same across EN/FR/AR.
 *
 * PRESENTATION ONLY: stored values, calculations and payloads are untouched.
 * Detailed tables, forms, invoices, print/export and history surfaces must
 * keep exact values — do not use these helpers there.
 */
import type { Currency, Language } from "../types/settings/settings";
import { localeForLanguage } from "./i18n";

const UNITS: Array<{ value: number; suffix: string }> = [
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "k" },
];

type LangInput = Language | string;

/** Resolve a runtime language to an Intl locale with Latin digits. */
function localeFor(input: LangInput | undefined): string {
  try {
    const lang = input === "ar" || input === "fr" || input === "en" ? input : "en";
    return localeForLanguage(lang as Language);
  } catch {
    return "en-GB";
  }
}

/** Locale-aware one-decimal trim (drops trailing ".0" → "10k", never "10.0k"). */
function trimOneDecimalLocalized(v: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
      numberingSystem: "latn",
    } as any).format(Math.round(v * 10) / 10);
  } catch {
    const rounded = Math.round(v * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
}

/** Locale-aware ≤2-decimal for values below 1000. */
function formatSmallLocalized(abs: number, locale: string): string {
  if (Number.isInteger(abs)) {
    try {
      return new Intl.NumberFormat(locale, {
        maximumFractionDigits: 0,
        numberingSystem: "latn",
      } as any).format(abs);
    } catch {
      return String(abs);
    }
  }
  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
      numberingSystem: "latn",
    } as any).format(abs);
  } catch {
    return String(Math.round(abs * 100) / 100);
  }
}

/** Round to at most one decimal, dropping a trailing ".0" (10k, not 10.0k). */
function trimOneDecimal(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function compactPositive(abs: number, locale?: string): string {
  const loc = locale ?? "en-GB";
  const trim = (v: number) =>
    locale ? trimOneDecimalLocalized(v, loc) : trimOneDecimal(v);
  for (let i = 0; i < UNITS.length; i++) {
    const { value, suffix } = UNITS[i];
    if (abs >= value) {
      const scaled = abs / value;
      const rounded = Math.round(scaled * 10) / 10;
      // Threshold promotion: rounding reached the next unit
      // (999999 → 1M, never 1000k; same for M → B).
      if (rounded >= 1000) {
        const higher = UNITS[i - 1];
        if (higher) return `${trim(abs / higher.value)}${higher.suffix}`;
        // Absurd magnitude beyond B — keep the largest unit exactly.
        return `${trim(scaled)}${suffix}`;
      }
      return `${trim(scaled)}${suffix}`;
    }
  }
  // Below 1000: exact value, integers plain, fractions trimmed to ≤2 decimals.
  if (locale) return formatSmallLocalized(abs, loc);
  if (Number.isInteger(abs)) return String(abs);
  return String(Math.round(abs * 100) / 100);
}

/**
 * formatCompactNumber(1250000) → "1.3M". Signed, promotion-aware, at most
 * one decimal. NaN / ±Infinity (must never crash card rendering) → "—".
 * Optional language controls Intl grouping/decimal (latn digits); suffixes
 * stay deterministic k/M/B across languages.
 */
export function formatCompactNumber(value: number, language: LangInput = "en"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const locale = localeFor(language);
  if (value < 0) {
    const abs = compactPositive(Math.abs(value), locale);
    return abs === "—" ? "—" : `-${abs}`;
  }
  return compactPositive(value, locale);
}

/**
 * Compact currency for summary cards, mirroring formatCurrency placement:
 *   formatCompactCurrency(100000, "DA") → "100k DA"
 *   formatCompactCurrency(1250000, "DA") → "1.3M DA"
 */
export function formatCompactCurrency(
  value: number,
  currency: Currency,
  language: LangInput = "en",
): string {
  const compact = formatCompactNumber(value, language);
  switch (currency) {
    case "€":
      return `${compact} €`;
    case "$":
      return `$${compact}`;
    case "DA":
    default:
      return `${compact} DA`;
  }
}

/**
 * Exact grouped figure for title/tooltip/aria-label next to a compact value
 * (locale-aware grouping, Latin digits, never browser-default):
 *   exactNumberLabel(1254840) → "1,254,840" (en)
 *   exactNumberLabel(1254840, "fr") → "1 254 840" (narrow no-break spaces)
 */
export function exactNumberLabel(value: number, language: LangInput = "en"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const locale = localeFor(language);
  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      numberingSystem: "latn",
    } as any).format(value);
  } catch {
    return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  }
}
