"use client";

import { useEffect, useState, useCallback } from "react";
import { rvbUiPreferencesService, RVB_UI_PREFERENCES_EVENT } from "../services/rvb-ui-preferences.service";
import { DEFAULT_SETTINGS, getDirection } from "../lib/settings";
import type { Settings, Language, Currency } from "../types/settings/settings";
import { getSavedTheme, applyTheme } from "../lib/theme";

export function useRvbPresentationSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    try {
      return getSavedTheme();
    } catch {
      return "light";
    }
  });

  const refresh = useCallback(async () => {
    const s = await rvbUiPreferencesService.getPresentationSettings().catch(() => DEFAULT_SETTINGS);
    setSettings(s);
    try {
      const t = rvbUiPreferencesService.getTheme();
      setThemeState(t);
    } catch {}
    if (typeof document !== "undefined") {
      document.documentElement.lang = s.language;
      document.documentElement.dir = getDirection(s.language);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const h = (e: Event) => {
      const ce = e as CustomEvent<Settings>;
      if (ce?.detail) {
        setSettings(ce.detail);
        if (typeof document !== "undefined") {
          document.documentElement.lang = ce.detail.language;
          document.documentElement.dir = getDirection(ce.detail.language);
        }
      } else {
        void refresh();
      }
    };
    window.addEventListener(RVB_UI_PREFERENCES_EVENT, h as any);
    const themeH = () => {
      try {
        setThemeState(getSavedTheme());
      } catch {}
    };
    window.addEventListener("hebrih-theme-change", themeH);
    window.addEventListener("storage", themeH as any);
    return () => {
      window.removeEventListener(RVB_UI_PREFERENCES_EVENT, h as any);
      window.removeEventListener("hebrih-theme-change", themeH);
      window.removeEventListener("storage", themeH as any);
    };
  }, [refresh]);

  const setLanguage = useCallback(async (lang: Language) => {
    await rvbUiPreferencesService.setLanguage(lang);
    await refresh();
  }, [refresh]);

  const setTheme = useCallback(async (t: "light" | "dark") => {
    await rvbUiPreferencesService.setTheme(t);
    setThemeState(t);
  }, []);

  const currency: Currency = settings.currency as Currency;

  return {
    settings,
    language: settings.language as Language,
    currency,
    theme,
    customerTypes: settings.customerTypes || [],
    workerPositions: settings.workerPositions || [],
    setLanguage,
    setTheme,
    refresh,
  };
}
