import type { Settings, Language, Currency, NavigationStyle } from "../types/settings/settings";

export const SETTINGS_EVENT = "hebrih-settings-change";

// Second event name kept for backward compatibility: every canonical settings
// write dispatches BOTH events with the same canonical detail, so legacy
// RVB-only listeners keep working. No writer may dispatch an RVB-only detail
// that disagrees with canonical state (see publishSettings).
export const RVB_UI_PREFERENCES_EVENT = "rvb-ui-preferences-change";

// Physical localStorage key shared by the legacy RVB preference and the new
// architecture. Its ONLY roles now are:
//   1. cross-tab signal: every canonical save rewrites it AFTER Dexie
//      completes, so a `storage` event in another tab always finds fresh
//      canonical state when it re-reads Dexie;
//   2. synchronous cold-start hint for reload/new-tab/direct-URL mounts
//      (IndexedDB is async; localStorage is not);
//   3. ONE-TIME legacy migration input when no canonical row exists yet.
// It is NEVER a runtime value source: readers use the shared live cache or
// canonical Dexie state, never this key directly for rendering.
export const SETTINGS_MIRROR_STORAGE_KEY = "rvb-ui-navigation-style";

// Session-shared live settings. Module singleton: every shell mounts with
// the already-known preference instead of rediscovering it from Dexie
// starting at the default (which caused a FloatingNav flash on every
// client-side route transition). Hydration-safe: the module instance is
// fresh on the server and on first client load (cache empty → DEFAULT),
// and setCachedSettings is only ever called from client-side effects,
// event handlers, and post-save paths — never during SSR/render.
// Warmed by settingsService.save plus every shell settings assignment.
let cachedSettings: Settings | undefined;

export function getCachedSettings(): Settings | undefined {
  return cachedSettings;
}

export function setCachedSettings(next: Settings): void {
  cachedSettings = next;
}

// Strict validator: unlike resolveNavigationStyle (which coerces anything
// unknown to "floating"), this distinguishes "absent/invalid" from a real
// stored choice, so canonical-wins and one-time-migration rules work.
export function isValidNavigationStyleValue(v: unknown): v is NavigationStyle {
  return v === "classic" || v === "floating";
}

// Synchronous mirror read. Client-only callers (effects, event handlers).
// Returns undefined when the mirror is absent or holds an invalid value.
export function readMirroredNavigationStyle(): NavigationStyle | undefined {
  try {
    if (typeof window !== "undefined") {
      const v = window.localStorage.getItem(SETTINGS_MIRROR_STORAGE_KEY);
      if (isValidNavigationStyleValue(v)) return v;
    }
  } catch {}
  return undefined;
}

function writeMirroredNavigationStyle(style: NavigationStyle): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_MIRROR_STORAGE_KEY, style);
    }
  } catch {}
}

// Tri-state live navigation: the established canonical value when any save
// has ever been published this session (or mirrored by an earlier one),
// otherwise undefined (fresh profile — caller applies migration/default).
export function readLiveNavigationStyle(): NavigationStyle | undefined {
  const cached = cachedSettings?.navigationStyle;
  if (isValidNavigationStyleValue(cached)) return cached;
  return readMirroredNavigationStyle();
}

// Best-effort synchronous navigation value: shared live cache first, then
// the cross-tab mirror, then the canonical default. Used to stamp legacy
// RVB-service payloads so they can never override canonical state, and as
// the pre-paint cold-start hint (never during SSR/render).
export function resolveLiveNavigationStyleSync(): NavigationStyle {
  return readLiveNavigationStyle() ?? "floating";
}

// Adopt canonical state WITHOUT notifying: mount-time canonical loads use
// this (no event storm on every route mount). Mutations must go through the
// canonical service save path, which publishes loudly.
export function adoptSettingsSilent(next: Settings): void {
  cachedSettings = next;
  writeMirroredNavigationStyle(resolveNavigationStyle(next.navigationStyle));
}

// ONE subscription/update path for canonical settings mutations.
// Publishes the SAME canonical detail to the shared live cache, the mirror,
// and both event channels. Callers must persist via the canonical settings
// service first (persist-then-publish ordering), then call this once.
export function publishSettings(next: Settings): void {
  cachedSettings = next;
  writeMirroredNavigationStyle(resolveNavigationStyle(next.navigationStyle));
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
    }
  } catch {}
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(RVB_UI_PREFERENCES_EVENT, { detail: next }));
    }
  } catch {}
}

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  currency: "DA",
  customerTypes: [],
  workerPositions: [],
  vehicleTypes: [],
  expenseTypes: [],
  navigationStyle: "floating",
  notifications: {
    inAppEnabled: true,
    desktopEnabled: false,
    soundEnabled: false,
    customerOrders: true,
    tasks: true,
    inventory: true,
    financial: true,
    system: true,
  },
};

export function formatCurrency(
  amount: number,
  currency: Currency,
): string {
  switch (currency) {
    case "€":
      return `${amount.toFixed(2)} €`;
    case "$":
      return `$${amount.toFixed(2)}`;
    case "DA":
    default:
      return `${amount.toFixed(2)} DA`;
  }
}

export function getDirection(language: Language): "ltr" | "rtl" {
  return language === "ar" ? "rtl" : "ltr";
}

export function resolveNavigationStyle(value: unknown): NavigationStyle {
  return value === "classic" ? "classic" : "floating";
}

export function getLanguageName(language: Language): string {
  switch (language) {
    case "fr":
      return "Français";
    case "ar":
      return "العربية";
    case "en":
    default:
      return "English";
  }
}
