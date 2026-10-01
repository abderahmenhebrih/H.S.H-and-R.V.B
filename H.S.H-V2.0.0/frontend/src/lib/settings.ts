import type { Settings, Language, Currency, NavigationStyle } from "../types/settings/settings";

export const SETTINGS_EVENT = "hebrih-settings-change";

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  currency: "DA",
  customerTypes: [],
  workerPositions: [],
  vehicleTypes: [],
  expenseTypes: [],
  navigationStyle: "floating",
  // RVB default stays classic (existing users keep their sidebar).
  // HSH ignores this field entirely.
  rvbNavigationStyle: "classic",
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

export function resolveRvbNavigationStyle(value: unknown): NavigationStyle {
  return value === "floating" ? "floating" : "classic";
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
