"use client";

import { rvbAuthService } from "./rvb-auth.service";
import { rvbConfigService } from "./rvb-config.service";
import {
  DEFAULT_SETTINGS,
  getDirection,
  readLiveNavigationStyle,
  resolveNavigationStyle,
  RVB_UI_PREFERENCES_EVENT,
  SETTINGS_MIRROR_STORAGE_KEY,
} from "../lib/settings";
// Single canonical event channel lives in lib/settings; re-exported here so
// existing importers keep working. Canonical writes dispatch both events.
export { RVB_UI_PREFERENCES_EVENT };
import type { Settings, Language, Currency, NavigationStyle } from "../types/settings/settings";
import { getSavedTheme, applyTheme } from "../lib/theme";

export const RVB_LANGUAGE_STORAGE_KEY = "rvb-ui-language";
// Physical key is owned by lib/settings now (cross-tab signal + cold-start
// hint + one-time migration input). Aliased here for compatibility; it is
// NEVER a runtime navigation value source.
export const RVB_NAVIGATION_STYLE_STORAGE_KEY = SETTINGS_MIRROR_STORAGE_KEY;

function isValidNavigationStyle(v: any): v is NavigationStyle {
  return v === "classic" || v === "floating";
}

function getLocalLanguage(): Language {
  try {
    if (typeof window !== "undefined") {
      const v = localStorage.getItem(RVB_LANGUAGE_STORAGE_KEY);
      if (v === "en" || v === "fr" || v === "ar") return v as Language;
    }
  } catch {}
  return "en";
}

function setLocalLanguageStorage(lang: Language) {
  try {
    if (typeof window !== "undefined") localStorage.setItem(RVB_LANGUAGE_STORAGE_KEY, lang);
  } catch {}
}

function dispatchRvbPreferences(settings: Settings) {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(RVB_UI_PREFERENCES_EVENT, { detail: settings }));
    }
  } catch {}
}

function applyDocumentLanguage(lang: Language) {
  try {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = getDirection(lang);
    }
  } catch {}
}

function isValidLanguage(v: any): v is Language {
  return v === "en" || v === "fr" || v === "ar";
}
function isValidTheme(v: any): boolean {
  return v === "light" || v === "dark";
}

function getLocalNavigationStyle(): NavigationStyle {
  try {
    if (typeof window !== "undefined") {
      // Same key historically stored the RVB-specific value; canonical
      // values are identical ("classic" | "floating"), so stored values
      // carry over and resolve through the shared resolver.
      return resolveNavigationStyle(localStorage.getItem(RVB_NAVIGATION_STYLE_STORAGE_KEY));
    }
  } catch {}
  return resolveNavigationStyle(undefined);
}

// LEGACY migration input only (account ui.navigationStyle, then obsolete
// ui.rvbNavigationStyle, then the local mirror). Used exclusively by the
// canonical loader when NO canonical Dexie value exists. Never a runtime
// source: live readers use the shared cache / canonical state instead.
export async function getEffectiveNavigationStyle(): Promise<NavigationStyle> {
  const local = getLocalNavigationStyle();
  try {
    const token = rvbAuthService.getAccessToken();
    if (!token) return local;
    const prefs = await rvbAuthService.getPreferences().catch(() => null);
    const ui = (prefs as any)?.ui;
    // Canonical field first; legacy RVB-specific field migrates once.
    if (isValidNavigationStyle(ui?.navigationStyle)) return ui.navigationStyle;
    if (isValidNavigationStyle(ui?.rvbNavigationStyle)) return ui.rvbNavigationStyle;
    return local;
  } catch {
    return local;
  }
}

/**
 * RVB-safe UI preferences service.
 * Provides language, theme, currency without H.S.H Dexie.
 * - language: personal, stored in RvbAccount.preferences.ui.language, fallback localStorage
 * - theme: personal/browser, stored in localStorage via theme.ts + optionally account ui.theme
 * - currency: company setting from GET /api/rvb/config
 */
export const rvbUiPreferencesService = {
  /** Sync local getter for immediate render (no async) */
  getLocalLanguageSync(): Language {
    return getLocalLanguage();
  },

  /** Get effective language: account ui.language if authenticated, else localStorage */
  async getLanguage(): Promise<Language> {
    const local = getLocalLanguage();
    try {
      const token = rvbAuthService.getAccessToken();
      if (!token) return local;
      const prefs = await rvbAuthService.getPreferences().catch(() => null);
      const uiLang = (prefs as any)?.ui?.language;
      if (isValidLanguage(uiLang)) return uiLang;
      return local;
    } catch {
      return local;
    }
  },

  /** Set language: for authenticated saves to account preferences (authoritative), else localStorage */
  async setLanguage(lang: Language): Promise<void> {
    if (!isValidLanguage(lang)) throw new Error("Invalid language");
    const token = rvbAuthService.getAccessToken();
    if (token) {
      try {
        await rvbAuthService.updatePreferences({ ui: { language: lang } } as any);
      } catch {
        // fallback to local if server fails
        setLocalLanguageStorage(lang);
      }
    } else {
      setLocalLanguageStorage(lang);
    }
    applyDocumentLanguage(lang);
    // Also update local storage for pre-login fallback consistency
    setLocalLanguageStorage(lang);
    // Fetch latest presentation settings and dispatch
    const settings = await this.getPresentationSettings();
    dispatchRvbPreferences(settings);
  },

  /** Get theme from lightweight localStorage mechanism (shared visually if same browser) */
  getTheme(): "light" | "dark" {
    try {
      return getSavedTheme();
    } catch {
      return "light";
    }
  },

  /** Set theme: persists via localStorage + optionally to account ui.theme if authenticated */
  async setTheme(theme: "light" | "dark"): Promise<void> {
    if (!isValidTheme(theme)) throw new Error("Invalid theme");
    applyTheme(theme);
    const token = rvbAuthService.getAccessToken();
    if (token) {
      try {
        await rvbAuthService.updatePreferences({ ui: { theme } } as any).catch(() => {});
      } catch {}
    }
    const settings = await this.getPresentationSettings();
    dispatchRvbPreferences(settings);
  },

  async getCurrency(): Promise<Currency> {
    try {
      const cfg = await rvbConfigService.get().catch(() => null);
      if (cfg?.currency && ["DA", "€", "$"].includes(cfg.currency)) return cfg.currency as Currency;
    } catch {}
    return (DEFAULT_SETTINGS.currency as Currency) || "DA";
  },

  /** Build a Settings-like object for RVB presentation without Dexie.
   *  Language from account/local, currency + workerPositions/customerTypes from config.
   */
  async getPresentationSettings(): Promise<Settings> {
    let language: Language = getLocalLanguage();
    try {
      const token = rvbAuthService.getAccessToken();
      if (token) {
        const prefs = await rvbAuthService.getPreferences().catch(() => null);
        const uiLang = (prefs as any)?.ui?.language;
        if (isValidLanguage(uiLang)) language = uiLang;
      }
    } catch {}

    let currency: Currency = DEFAULT_SETTINGS.currency as Currency;
    let customerTypes: string[] = DEFAULT_SETTINGS.customerTypes || [];
    let workerPositions: string[] = DEFAULT_SETTINGS.workerPositions || [];
    let vehicleTypes: string[] = DEFAULT_SETTINGS.vehicleTypes || [];
    let expenseTypes: string[] = DEFAULT_SETTINGS.expenseTypes || [];
    try {
      const cfg = await rvbConfigService.get().catch(() => null);
      if (cfg) {
        if (cfg.currency && ["DA", "€", "$"].includes(cfg.currency)) currency = cfg.currency as Currency;
        if (Array.isArray((cfg as any).customerTypes)) customerTypes = (cfg as any).customerTypes;
        if (Array.isArray((cfg as any).workerPositions)) workerPositions = (cfg as any).workerPositions;
        if (Array.isArray((cfg as any).vehicleTypes)) vehicleTypes = (cfg as any).vehicleTypes;
        if (Array.isArray((cfg as any).expenseTypes)) expenseTypes = (cfg as any).expenseTypes;
      }
    } catch {}

    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      language,
      currency,
      customerTypes,
      workerPositions,
      vehicleTypes,
      expenseTypes,
      // Canonical navigation wins: an established live/mirrored value always
      // reflects the latest canonical save. Legacy account/local values are
      // consulted ONLY when no canonical value was ever established (fresh
      // profile that never saved canonical state).
      navigationStyle: readLiveNavigationStyle() ?? (await getEffectiveNavigationStyle()),
    };
    return settings;
  },

  /** Legacy compat alias for pages that expect settingsService.get() */
  async get(): Promise<Settings> {
    return this.getPresentationSettings();
  },

  /** Apply account language as authoritative after login (call from auth context) */
  async syncFromAccount(): Promise<Settings> {
    const settings = await this.getPresentationSettings();
    applyDocumentLanguage(settings.language);
    // Also ensure theme from account if present
    try {
      const token = rvbAuthService.getAccessToken();
      if (token) {
        const prefs = await rvbAuthService.getPreferences().catch(() => null);
        const uiTheme = (prefs as any)?.ui?.theme;
        if (isValidTheme(uiTheme)) {
          applyTheme(uiTheme as any);
        }
      }
    } catch {}
    dispatchRvbPreferences(settings);
    return settings;
  },

  /** Persist fallback language locally without server (for pre-login) */
  setLocalLanguage(lang: Language) {
    setLocalLanguageStorage(lang);
    applyDocumentLanguage(lang);
    this.getPresentationSettings().then((s) => dispatchRvbPreferences(s)).catch(() => {});
  },

  /** Shared global navigation style ("classic" | "floating").
   *  Single-canonical architecture: this delegates to the canonical Dexie
   *  settings mutation (settingsService.setNavigationStyle), which persists,
   *  publishes the shared live cache, dispatches both event channels, and
   *  refreshes the cross-tab mirror. There is deliberately NO independent
   *  account/localStorage navigation write anymore: legacy account fields
   *  (ui.navigationStyle / ui.rvbNavigationStyle) and the local mirror are
   *  one-time migration inputs only, read when no canonical value exists.
   */
  async setRvbNavigationStyle(style: NavigationStyle): Promise<void> {
    const { settingsService } = await import("./settings.service");
    await settingsService.setNavigationStyle(style);
  },
};
