import type { Language } from "../types/settings/settings";
import { GENERIC_ERROR, localizeError } from "./i18n";

type Trilingual = { en: string; fr: string; ar: string };
type RvbDict = { en?: any; fr?: any; ar?: any };

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

/**
 * Resolve a backend/service error for an RVB web-portal page.
 * - Known stable error codes (RVB_* tables, page TR `errors` tables) resolve
 *   to the translated string for the active language.
 * - Unknown errors fall back to the page's localized generic message — raw
 *   English backend text never reaches the UI (it stays in console.warn via
 *   the shared helper).
 * - `missing` covers absent/empty errors.
 */
export function resolveRvbError(
  err: unknown,
  TR: RvbDict,
  language: Language,
  opts?: { generic?: Partial<Trilingual>; codes?: Record<string, string> },
): string {
  const enErr = asRecord(TR.en?.errors);
  const frErr = asRecord(TR.fr?.errors);
  const arErr = asRecord(TR.ar?.errors);
  const codes = new Set<string>([
    ...Object.keys(enErr),
    ...Object.keys(frErr),
    ...Object.keys(arErr),
    ...Object.keys(opts?.codes ?? {}),
  ]);
  const codeMap: Record<string, Trilingual> = {};
  for (const code of codes) {
    const en = (enErr[code] as string) ?? opts?.codes?.[code] ?? code;
    const fr = (frErr[code] as string) ?? opts?.codes?.[code] ?? code;
    const ar = (arErr[code] as string) ?? opts?.codes?.[code] ?? code;
    if (typeof en === "string" && typeof fr === "string" && typeof ar === "string") {
      codeMap[code] = { en, fr, ar };
    }
  }
  const generic: Trilingual = {
    en: (opts?.generic?.en as string) ?? (enErr.generic as string) ?? GENERIC_ERROR.en,
    fr: (opts?.generic?.fr as string) ?? (frErr.generic as string) ?? GENERIC_ERROR.fr,
    ar: (opts?.generic?.ar as string) ?? (arErr.generic as string) ?? GENERIC_ERROR.ar,
  };
  return localizeError(err, language, codeMap, generic);
}
