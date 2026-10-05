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
import type { Currency } from "../types/settings/settings";

const UNITS: Array<{ value: number; suffix: string }> = [
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "k" },
];

/** Round to at most one decimal, dropping a trailing ".0" (10k, not 10.0k). */
function trimOneDecimal(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function compactPositive(abs: number): string {
  for (let i = 0; i < UNITS.length; i++) {
    const { value, suffix } = UNITS[i];
    if (abs >= value) {
      const scaled = abs / value;
      const rounded = Math.round(scaled * 10) / 10;
      // Threshold promotion: rounding reached the next unit
      // (999999 → 1M, never 1000k; same for M → B).
      if (rounded >= 1000) {
        const higher = UNITS[i - 1];
        if (higher) return `${trimOneDecimal(abs / higher.value)}${higher.suffix}`;
        // Absurd magnitude beyond B — keep the largest unit exactly.
        return `${trimOneDecimal(scaled)}${suffix}`;
      }
      return `${trimOneDecimal(scaled)}${suffix}`;
    }
  }
  // Below 1000: exact value, integers plain, fractions trimmed to ≤2 decimals.
  if (Number.isInteger(abs)) return String(abs);
  return String(Math.round(abs * 100) / 100);
}

/**
 * formatCompactNumber(1250000) → "1.3M". Signed, promotion-aware, at most
 * one decimal. NaN / ±Infinity (must never crash card rendering) → "—".
 */
export function formatCompactNumber(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 0) {
    const abs = compactPositive(Math.abs(value));
    return abs === "—" ? "—" : `-${abs}`;
  }
  return compactPositive(value);
}

/**
 * Compact currency for summary cards, mirroring formatCurrency placement:
 *   formatCompactCurrency(100000, "DA") → "100k DA"
 *   formatCompactCurrency(1250000, "DA") → "1.3M DA"
 */
export function formatCompactCurrency(value: number, currency: Currency): string {
  const compact = formatCompactNumber(value);
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
 * (deterministic en-GB grouping, never browser-default):
 *   exactNumberLabel(1254840) → "1,254,840"
 */
export function exactNumberLabel(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}
