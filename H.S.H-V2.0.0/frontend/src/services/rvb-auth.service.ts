"use client";

import type { RvbAccount } from "../types/rvb/rvb-account";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";

const AUTH_BASE = `${API_BASE}/api/rvb/auth`;

// In-memory access token only — never persisted
let memoryAccessToken: string | null = null;
let pendingRefresh: Promise<{ accessToken: string; account: RvbSafeUser }> | null = null;

const RVB_SESSION_HINT_KEY = "rvb_has_session";

function hasSessionHint(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(RVB_SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}
function setSessionHint(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(RVB_SESSION_HINT_KEY, "1");
  } catch {}
}
function clearSessionHint(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(RVB_SESSION_HINT_KEY);
  } catch {}
}

// PBS-BUG-030: source-authoritative terminal-vs-transient classifier.
// Local authentication/session state (hint + known user) may be destroyed
// automatically ONLY on positive server evidence that the current session can
// no longer be used. A temporary inability to verify the session (network
// failure, timeout, 5xx, rate limit, unrecognized error) MUST NOT destroy it.
//
// Terminal set derived from CURRENT backend contracts (routes/rvb-auth.ts +
// middleware/rvb-auth.ts, proven by PBS-BUG-030 runtime matrix):
//   POST /api/rvb/auth/refresh -> 401 RVB_REFRESH_REQUIRED (no cookie)
//                              401 RVB_TOKEN_INVALID (malformed / revoked /
//                                  unknown / disabled / archived / deleted)
//                              401 RVB_TOKEN_EXPIRED (expired DB session)
//   requireRvbAuth (/me, ...)  -> 401 RVB_TOKEN_INVALID (bad access token)
//                              401 RVB_SESSION_REVOKED (revoked/expired session)
//                              401 RVB_UNAUTHENTICATED (no token / no account)
//                              403 RVB_ACCOUNT_ARCHIVED / RVB_ACCOUNT_DISABLED
//                              404 RVB_ACCOUNT_NOT_FOUND (defensive: the /me
//                                  handler emits it; middleware 401 fires first)
// Deliberately NOT terminal: 5xx, network errors, 429 RVB_RATE_LIMIT,
// 403 RVB_FORBIDDEN (role authorization — session itself is still valid),
// RVB_NO_SESSION_HINT (client-side gate, not server evidence), and any
// unrecognized code (UNKNOWN defaults to preservation).
const TERMINAL_RVB_AUTH_CODES = new Set([
  "RVB_TOKEN_INVALID",
  "RVB_TOKEN_EXPIRED",
  "RVB_SESSION_REVOKED",
  "RVB_REFRESH_REQUIRED",
  "RVB_UNAUTHENTICATED",
  "RVB_ACCOUNT_ARCHIVED",
  "RVB_ACCOUNT_DISABLED",
  "RVB_ACCOUNT_NOT_FOUND",
]);

export function isTerminalRvbAuthError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" && TERMINAL_RVB_AUTH_CODES.has(code);
}

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
    // Set non-sensitive hint that a session may exist (for silent refresh gating, not token content)
    setSessionHint();
    return { accessToken: data.accessToken, account: data.account, mustChangePassword: data.mustChangePassword };
  },

  async refresh(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    // Gated refresh: do not attempt if no hint that a session may exist (prevents pointless 401 loop)
    // Hint is non-sensitive local marker, not HttpOnly cookie content.
    if (!getAccessToken() && !hasSessionHint()) {
      throw Object.assign(new Error("RVB_NO_SESSION_HINT"), { code: "RVB_NO_SESSION_HINT", status: 401 });
    }
    const result = await getRefreshPromise();
    // Refresh succeeded → ensure hint persists
    setSessionHint();
    return result;
  },

  // Direct refresh without dedup (used by context init with same dedup)
  async refreshSession(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    if (!getAccessToken() && !hasSessionHint()) {
      throw Object.assign(new Error("RVB_NO_SESSION_HINT"), { code: "RVB_NO_SESSION_HINT", status: 401 });
    }
    const result = await getRefreshPromise();
    setSessionHint();
    return result;
  },

  // PBS-BUG-029: explicit cookie-probe restore for RVB-surface bootstrap only.
  // Same shared refresh promise as refresh(); differs ONLY by skipping the
  // no-hint pre-network refusal. The hint stays an optimization (not proof of
  // session absence): a valid HttpOnly cookie must be recoverable when entering
  // RVB even if the hint disappeared. Default refresh() keeps the quiet gate
  // for callers that must not probe (global HSH mounts). Success re-sets the
  // hint through the existing path.
  async restoreSessionFromCookie(): Promise<{ accessToken: string; account: RvbSafeUser }> {
    const result = await getRefreshPromise();
    setSessionHint();
    return result;
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
    clearSessionHint();
    pendingRefresh = null;
  },

  async me(): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/me`, {
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
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/change-password`, {
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
    // Ignore refreshToken for web (native handled via session metadata)
    return { accessToken: data.accessToken, account: data.account };
  },

  async onboarding(profilePicture: string): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/onboarding`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ profilePicture }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; account: RvbSafeUser }>(res);
    return data.account;
  },

  async updateProfile(payload: { displayName?: string; profilePicture?: string | null }): Promise<RvbSafeUser> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/profile`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; account: RvbSafeUser }>(res);
    return data.account;
  },

  async getPreferences(): Promise<{ notifications: Record<string, boolean>; ui?: { language?: string; theme?: string } }> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/preferences`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const data = await handleResponse<{ success: boolean; preferences: any }>(res);
    return data.preferences;
  },

  async updatePreferences(prefs: Record<string, boolean> | { notifications?: Record<string, boolean>; ui?: { language?: string; theme?: string } }): Promise<any> {
    const token = getAccessToken();
    // Backward compat: if plain notifications map passed without wrapper keys
    let body: any;
    if (prefs && typeof prefs === "object" && ("notifications" in (prefs as any) || "ui" in (prefs as any))) {
      body = prefs;
    } else {
      body = { notifications: prefs };
    }
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/preferences`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; preferences: any }>(res);
    return data.preferences;
  },

  async getSessions(): Promise<{ sessions: any[]; currentSessionId: string }> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/sessions`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const data = await handleResponse<{ success: boolean; sessions: any[]; currentSessionId: string }>(res);
    return data;
  },

  async revokeOtherSessions(): Promise<void> {
    const token = getAccessToken();
    const res = await rvbAuthService.authFetch(`${AUTH_BASE}/sessions/revoke-others`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
    await handleResponse(res);
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
    } catch (e) {
      // PBS-BUG-030: the just-used access token was rejected with 401, so drop
      // the cached copy. But only terminal refresh failures (server positively
      // proved the session is dead) may destroy durable session state via
      // notifyAuthFailure. Transient failures surface as the original 401 so
      // the caller fails without logging the user out.
      clearAccessToken();
      if (isTerminalRvbAuthError(e)) {
        notifyAuthFailure();
      }
      return res;
    }
  },

  clearLocal() {
    clearAccessToken();
    clearSessionHint();
    pendingRefresh = null;
  },

  hasSessionHint() {
    return hasSessionHint();
  },

  _notifyAuthFailureForTest() {
    notifyAuthFailure();
  },
};
