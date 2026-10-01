"use client";

import { rvbAuthService } from "./rvb-auth.service";
import { rvbConfigService } from "./rvb-config.service";
import { DEFAULT_SETTINGS, getDirection, resolveRvbNavigationStyle } from "../lib/settings";
import type { Settings, Language, Currency, NavigationStyle } from "../types/settings/settings";
import { getSavedTheme, applyTheme } from "../lib/theme";

export const RVB_UI_PREFERENCES_EVENT = "rvb-ui-preferences-change";
export const RVB_LANGUAGE_STORAGE_KEY = "rvb-ui-language";
export const RVB_NAVIGATION_STYLE_STORAGE_KEY = "rvb-ui-navigation-style";

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
      const v = localStorage.getItem(RVB_NAVIGATION_STYLE_STORAGE_KEY);
      if (v === "classic" || v === "floating") return v;
    }
  } catch {}
  return "classic";
}

function setLocalNavigationStyleStorage(style: NavigationStyle) {
  try {
    if (typeof window !== "undefined") localStorage.setItem(RVB_NAVIGATION_STYLE_STORAGE_KEY, style);
  } catch {}
}

async function getEffectiveNavigationStyle(): Promise<NavigationStyle> {
  const local = getLocalNavigationStyle();
  try {
    const token = rvbAuthService.getAccessToken();
    if (!token) return local;
    const prefs = await rvbAuthService.getPreferences().catch(() => null);
    const uiNav = (prefs as any)?.ui?.rvbNavigationStyle;
    if (uiNav === "classic" || uiNav === "floating") return uiNav;
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
      rvbNavigationStyle: await getEffectiveNavigationStyle(),
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

  /** Independent RVB navigation style ("classic" | "floating").
   *  Authoritative in account ui.rvbNavigationStyle when authenticated,
   *  localStorage fallback otherwise (same pattern as RVB language).
   *  Dispatches RVB_UI_PREFERENCES_EVENT so RvbShell switches live.
   */
  async setRvbNavigationStyle(style: NavigationStyle): Promise<void> {
    const next = resolveRvbNavigationStyle(style);
    const token = rvbAuthService.getAccessToken();
    if (token) {
      try {
        await rvbAuthService.updatePreferences({ ui: { rvbNavigationStyle: next } } as any);
      } catch {
        // fall through to local persistence
      }
    }
    setLocalNavigationStyleStorage(next);
    const settings = await this.getPresentationSettings();
    dispatchRvbPreferences(settings);
  },
};
