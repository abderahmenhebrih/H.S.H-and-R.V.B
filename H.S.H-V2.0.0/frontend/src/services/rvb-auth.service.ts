"use client";

import type { RvbAccount } from "../types/rvb/rvb-account";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";

const AUTH_BASE = `${API_BASE}/api/rvb/auth`;

// In-memory access token only — never persisted
let memoryAccessToken: string | null = null;
let pendingRefresh: Promise<{ accessToken: string; account: RvbSafeUser }> | null = null;

// Small subscription to allow authFetch to notify context when refresh fails
type AuthFailureListener = () => void;
const authFailureListeners = new Set<AuthFailureListener>();

function notifyAuthFailure() {
  authFailureListeners.forEach((cb) => {
    try { cb(); } catch {}
  });
}

function getAccessToken(): string | null {
  return memoryAccessToken;
}
function setAccessToken(token: string | null) {
  memoryAccessToken = token;
}

function clearAccessToken() {
  memoryAccessToken = null;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.code || data?.message || `Request failed ${res.status}`);
    err.code = data?.code;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export type RvbSafeUser = RvbAccount & { mustChangePassword?: boolean };

async function doRefreshRequest(): Promise<{ accessToken: string; account: RvbSafeUser }> {
  const res = await fetch(`${AUTH_BASE}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // No refreshToken in body — cookie only for web
    body: JSON.stringify({}),
    credentials: "include",
  });
  const data = await handleResponse<{ success: boolean; accessToken: string; refreshToken?: string; account: RvbSafeUser }>(res);
  // Web ignores returned refreshToken (HttpOnly cookie is the source of truth)
  if (data.accessToken) setAccessToken(data.accessToken);
  return { accessToken: data.accessToken, account: data.account };
}

function getRefreshPromise(): Promise<{ accessToken: string; account: RvbSafeUser }> {
  if (!pendingRefresh) {
    pendingRefresh = doRefreshRequest().finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

export const rvbAuthService = {
  getAccessToken,
  // Exposed for services that need Authorization header; no setter for refresh
  _setAccessToken: setAccessToken,

  subscribeAuthFailure(listener: AuthFailureListener): () => void {
    authFailureListeners.add(listener);
    return () => authFailureListeners.delete(listener);
  },

  async login(tag: string, password: string): Promise<{ accessToken: string; account: RvbSafeUser; mustChangePassword?: boolean }> {
    const res = await fetch(`${AUTH_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, password }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; accessToken: string; refreshToken?: string; account: RvbSafeUser; mustChangePassword?: boolean }>(res);
    if (data.accessToken) setAccessToken(data.accessToken);
    // Intentionally ignore data.refreshToken — HttpOnly cookie holds it for web
    return { accessToken: data.accessToken, account: data.account, mustChangePassword: data.mustChangePassword };
  },

  async refresh(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    // Use deduped refresh
    return getRefreshPromise();
  },

  // Direct refresh without dedup (used by context init with same dedup)
  async refreshSession(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    return getRefreshPromise();
  },

  async logout(): Promise<void> {
    const accessToken = getAccessToken();
    try {
      await fetch(`${AUTH_BASE}/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        // No refreshToken in body — cookie only; mobile would send body, web doesn't
        body: JSON.stringify({}),
        credentials: "include",
      });
    } catch {}
    clearAccessToken();
    pendingRefresh = null;
  },

  async me(): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await fetch(`${AUTH_BASE}/me`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const data = await handleResponse<{ success: boolean; account: RvbSafeUser }>(res);
    return data.account;
  },

  async changePassword(payload: { currentPassword: string; newPassword: string; confirmPassword: string }): Promise<{ accessToken?: string; account: RvbSafeUser }> {
    const token = getAccessToken();
    const res = await fetch(`${AUTH_BASE}/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; accessToken?: string; refreshToken?: string; account: RvbSafeUser }>(res);
    if (data.accessToken) setAccessToken(data.accessToken);
    // Ignore refreshToken for web
    return { accessToken: data.accessToken, account: data.account };
  },

  async authFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    const token = getAccessToken();
    const headers: any = { ...(init?.headers as any) };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(input, { ...init, headers, credentials: "include" as any });
    if (res.status !== 401) return res;
    // One retry with single shared refresh
    try {
      const refreshed = await getRefreshPromise();
      const retryHeaders: any = { ...(init?.headers as any), Authorization: `Bearer ${refreshed.accessToken}` };
      return fetch(input, { ...init, headers: retryHeaders, credentials: "include" as any });
    } catch {
      clearAccessToken();
      notifyAuthFailure();
      return res;
    }
  },

  clearLocal() {
    clearAccessToken();
    pendingRefresh = null;
  },

  _notifyAuthFailureForTest() {
    notifyAuthFailure();
  },
};
