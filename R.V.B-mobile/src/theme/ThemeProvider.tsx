import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { lightTheme } from "./light";
import { darkTheme } from "./dark";
import type { AppTheme } from "./light";
import { useAuthStore } from "@/stores/auth-store";
import { getApiBaseUrl } from "@/api/config";
import { getAccessTokenMemory } from "@/api/client";

export type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: AppTheme;
  mode: ThemeMode;
  resolved: ResolvedTheme;
  isDark: boolean;
  setTheme: (mode: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme as unknown as AppTheme,
  mode: "light",
  resolved: "light",
  isDark: false,
  setTheme: () => {},
});

const STORAGE_KEY = "rvb-theme";

function getStoredMode(): ThemeMode {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "light" || v === "dark" || v === "system") return v;
    }
  } catch {}
  return "light";
}

function persistMode(mode: ThemeMode) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
  } catch {}
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(() => getStoredMode());
  const account = useAuthStore((s) => s.account);
  const setAccount = useAuthStore((s) => s.setAccount);

  // Sync from backend preferences when authenticated
  useEffect(() => {
    const backendTheme = account?.preferences?.ui?.theme;
    if (backendTheme === "light" || backendTheme === "dark") {
      // Backend overrides local if present and mode is not system
      // For system mode we respect local system, not backend
      if (mode !== "system") {
        setModeState(backendTheme as ThemeMode);
        persistMode(backendTheme as ThemeMode);
      }
    }
  }, [account?.preferences?.ui?.theme]);

  // Initialize from backend on first load if account has theme
  useEffect(() => {
    // If backend has theme and local was light default, prefer backend
    const backendTheme = account?.preferences?.ui?.theme;
    if (backendTheme && getStoredMode() === "light" && mode === "light") {
      // Only if user never changed local, adopt backend
      // No-op if same
    }
  }, []);

  const resolved: ResolvedTheme = useMemo(() => {
    if (mode === "system") return systemScheme === "dark" ? "dark" : "light";
    return mode;
  }, [mode, systemScheme]);

  const theme = useMemo<AppTheme>(() => {
    return (resolved === "dark" ? darkTheme : lightTheme) as unknown as AppTheme;
  }, [resolved]);

  const setTheme = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      persistMode(next);
      // Persist to backend if authenticated and not system
      const token = getAccessTokenMemory();
      const acc = useAuthStore.getState().account;
      if (acc && token && next !== "system") {
        const base = (() => {
          try {
            return getApiBaseUrl();
          } catch {
            return null;
          }
        })();
        if (base) {
          fetch(`${base}/api/rvb/auth/preferences`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "X-RVB-Client": "native",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ ui: { theme: next } }),
          })
            .then(async (r) => {
              if (r.ok) {
                const txt = await r.text();
                try {
                  const j = txt ? JSON.parse(txt) : null;
                  if (j?.account) setAccount(j.account);
                  else {
                    // patch doesn't return account, optimistically update
                    setAccount({ ...acc, preferences: { ...(acc.preferences as any), ui: { ...(acc.preferences?.ui as any), theme: next } } } as any);
                  }
                } catch {}
              }
            })
            .catch(() => {});
        }
      }
    },
    [setAccount]
  );

  const value = useMemo<ThemeContextValue>(() => ({ theme, mode, resolved, isDark: resolved === "dark", setTheme }), [theme, mode, resolved, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
