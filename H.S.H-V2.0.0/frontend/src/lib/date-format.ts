/**
 * Application-wide numeric date standard: DD/MM/YYYY for all user-visible
 * presentation and manual input, across English / French / Arabic.
 *
 * Storage / API / internal values stay canonical: YYYY-MM-DD (strings) or
 * millisecond timestamps. This module is PRESENTATION / INPUT UX only —
 * it never changes what is persisted.
 *
 * Timezone safety: date-only values are handled as year/month/day strings.
 * We never construct a UTC Date from an ISO date-only string (which can
 * shift the day in negative-offset timezones).
 */

export const DATE_DISPLAY_PLACEHOLDER = "DD/MM/YYYY";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real Gregorian calendar date (leap-year aware). */
function isRealDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1000 || y > 9999) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // Day 0 of the next month = last day of month m (local, no UTC shift).
  const lastDay = new Date(y, m, 0).getDate();
  return d <= lastDay;
}

/** Strict YYYY-MM-DD real-date check. */
export function isValidIsoDate(iso: string): boolean {
  if (typeof iso !== "string") return false;
  const match = ISO_RE.exec(iso.trim());
  if (!match) return false;
  return isRealDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

/**
 * formatIsoDateToDisplay("2026-10-05") → "05/10/2026".
 * Returns "" for empty/invalid input (never throws, never guesses).
 */
export function formatIsoDateToDisplay(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "";
  const match = ISO_RE.exec(iso.trim());
  if (!match) return "";
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (!isRealDate(y, m, d)) return "";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/**
 * parseDisplayDateToIso("05/10/2026") → "2026-10-05".
 * Strict DD/MM/YYYY parsing with real-calendar validation:
 * - accepts 1-2 digit day/month ("5/10/2026" → "2026-10-05"), requires 4-digit year
 * - rejects 31/02/2026, 00/10/2026, 12/13/2026, 29/02/2027 (non-leap),
 *   29/02/2028 accepted (leap), non-numeric junk, wrong separators
 * - day/month/year are parsed explicitly — never via `new Date(str)`
 *   (locale-ambiguous) and never via UTC construction (no day shift).
 * Returns null when invalid (caller decides: revert, show error, etc.).
 */
export function parseDisplayDateToIso(display: string | null | undefined): string | null {
  if (!display || typeof display !== "string") return null;
  const trimmed = display.trim();
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  if (!isRealDate(y, m, d)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Local-time DD/MM/YYYY for a Date object (no UTC conversion). */
export function formatDateObjectToDisplay(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

/** Local-time DD/MM/YYYY for a millisecond timestamp. */
export function formatTimestampToDisplay(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return "";
  const n = Number(ts);
  if (!Number.isFinite(n)) return "";
  return formatDateObjectToDisplay(new Date(n));
}

/** Today's date as canonical local YYYY-MM-DD (no UTC day-shift). */
export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
