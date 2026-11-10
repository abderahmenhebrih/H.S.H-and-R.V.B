/**
 * Deterministic money helper — round to 2 decimals at line level, sum rounded lines.
 * Use integer minor units where practical, but keep API simple.
 */
import type { Language } from "../types/settings/settings";
import { localeForLanguage } from "./i18n";

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeLineTotals(
  weightKg: number,
  price: number,
  quantity: number,
  vatRate: number,
  otherTaxRate: number = 0,
  discountAmount: number = 0
): { totalHT: number; taxAmount: number; otherTaxAmount: number; totalTTC: number } {
  const totalHT = roundMoney(weightKg * price - discountAmount);
  const taxAmount = roundMoney(totalHT * (vatRate / 100));
  const otherTaxAmount = roundMoney(totalHT * (otherTaxRate / 100));
  const totalTTC = roundMoney(totalHT + taxAmount + otherTaxAmount);
  return { totalHT, taxAmount, otherTaxAmount, totalTTC };
}

export function sumMoney(values: number[]): number {
  return roundMoney(values.reduce((a, b) => a + b, 0));
}

type LangInput = Language | string;

function resolveLocale(language: LangInput = "en"): string {
  try {
    const lang = language === "ar" || language === "fr" || language === "en" ? language : "en";
    return localeForLanguage(lang as Language);
  } catch {
    return "en-GB";
  }
}

/**
 * Locale-aware number presentation (grouping, Latin digits). Math stays in
 * roundMoney/sumMoney — this never rounds accounts, only formats for display.
 */
export function formatAmountForLanguage(
  value: number,
  language: LangInput = "en",
  options?: Intl.NumberFormatOptions,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat(resolveLocale(language), {
      numberingSystem: "latn",
      ...options,
    } as any).format(value);
  } catch {
    return new Intl.NumberFormat("en-GB", options).format(value);
  }
}

/**
 * Locale-aware currency presentation (grouping, Latin digits). Placement
 * mirrors settings.formatCurrency: $ prefix, €/DA suffix — accounting values
 * are untouched, only the displayed string is localized.
 */
export function formatCurrencyForLanguage(
  value: number,
  currency: string,
  language: LangInput = "en",
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const grouped = formatAmountForLanguage(value, language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (currency === "$") return `$${grouped}`;
  if (currency === "€") return `${grouped} €`;
  return `${grouped} ${currency || "DA"}`;
}
