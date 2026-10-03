import type { Settings, Language, Currency, NavigationStyle } from "../types/settings/settings";

export const SETTINGS_EVENT = "hebrih-settings-change";

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
