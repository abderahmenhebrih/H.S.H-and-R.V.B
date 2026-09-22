"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { rvbAuthService, type RvbSafeUser } from "../services/rvb-auth.service";

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
    // No token or me failed → attempt silent refresh using HttpOnly cookie
    try {
      const refreshed = await rvbAuthService.refresh();
      setUser(refreshed.account);
    } catch {
      rvbAuthService.clearLocal();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadMe(); }, [loadMe]);

  useEffect(() => {
    const unsub = rvbAuthService.subscribeAuthFailure(() => {
      rvbAuthService.clearLocal();
      setUser(null);
    });
    return unsub;
  }, []);

  const login = useCallback(async (tag: string, password: string) => {
    const res = await rvbAuthService.login(tag, password);
    setUser(res.account);
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
