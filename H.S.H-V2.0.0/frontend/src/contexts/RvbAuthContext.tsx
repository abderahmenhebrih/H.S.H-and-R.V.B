"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { rvbAuthService, isTerminalRvbAuthError, type RvbSafeUser } from "../services/rvb-auth.service";

type RvbAuthState = {
  user: RvbSafeUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (tag: string, password: string) => Promise<RvbSafeUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changePassword: (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<void>;
  completeOnboarding: (profilePicture: string) => Promise<RvbSafeUser>;
  setUser: (u: RvbSafeUser | null) => void;
};

const Ctx = createContext<RvbAuthState | null>(null);

export function RvbAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<RvbSafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  const loadMe = useCallback(async () => {
    // Access token is memory-only: on full refresh it is null — restore via HttpOnly refresh cookie
    const token = rvbAuthService.getAccessToken();
    if (token) {
      try {
        const me = await rvbAuthService.me();
        setUser(me);
        setLoading(false);
        return;
      } catch {
        // access expired, fall through to refresh
      }
    }
    // No token or me failed → attempt silent refresh using HttpOnly cookie.
    // PBS-BUG-029: on the RVB surface allow ONE explicit cookie probe even when
    // the local hint is absent (hint is an optimization, not proof of absence).
    // Ordinary HSH routes keep the gated refresh() so unauthenticated pages
    // stay quiet with zero refresh traffic.
    const onRvbSurface = pathname === "/rvb" || pathname.startsWith("/rvb/");
    try {
      const refreshed = onRvbSurface
        ? await rvbAuthService.restoreSessionFromCookie()
        : await rvbAuthService.refresh();
      setUser(refreshed.account);
    } catch (e) {
      // PBS-BUG-030: destroy local session state ONLY on positive server
      // evidence the session is terminal (see isTerminalRvbAuthError).
      // Transient bootstrap failures (network/5xx) preserve the hint, the
      // HttpOnly cookie, and any already-known user so a later retry/reload
      // can recover. Cold bootstrap simply stays user === null.
      if (isTerminalRvbAuthError(e)) {
        rvbAuthService.clearLocal();
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => { void loadMe(); }, [loadMe]);

  // After user is set, sync presentation language from account (authoritative)
  useEffect(() => {
    if (user) {
      (async () => {
        try {
          const { rvbUiPreferencesService } = await import("../services/rvb-ui-preferences.service");
          await rvbUiPreferencesService.syncFromAccount();
        } catch {}
      })();
    }
  }, [user?.id]);

  useEffect(() => {
    // PBS-BUG-030: authFetch notifies ONLY after a terminal refresh failure
    // (classification happens before notifyAuthFailure), so an unconditional
    // clear here remains correct. Transient refresh failures never notify.
    const unsub = rvbAuthService.subscribeAuthFailure(() => {
      rvbAuthService.clearLocal();
      setUser(null);
    });
    return unsub;
  }, []);

  const login = useCallback(async (tag: string, password: string) => {
    const res = await rvbAuthService.login(tag, password);
    setUser(res.account);
    try {
      const { rvbUiPreferencesService } = await import("../services/rvb-ui-preferences.service");
      await rvbUiPreferencesService.syncFromAccount();
    } catch {}
    return res.account;
  }, []);

  const logout = useCallback(async () => {
    await rvbAuthService.logout();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const data = await rvbAuthService.refresh();
    setUser(data.account);
  }, []);

  const changePassword = useCallback(async (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    const data = await rvbAuthService.changePassword(payload);
    if (data.account) setUser(data.account);
  }, []);

  const completeOnboarding = useCallback(async (profilePicture: string) => {
    const account = await rvbAuthService.onboarding(profilePicture);
    setUser(account as RvbSafeUser);
    return account as RvbSafeUser;
  }, []);

  const value = useMemo<RvbAuthState>(() => ({
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    refresh,
    changePassword,
    completeOnboarding,
    setUser,
  }), [user, loading, login, logout, refresh, changePassword, completeOnboarding]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRvbAuth(): RvbAuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRvbAuth must be used within RvbAuthProvider");
  return ctx;
}
