import { create } from "zustand";
import { getApiBaseUrl } from "@/api/config";
import { setAccessTokenMemory, getAccessTokenMemory } from "@/api/client";
import { getRefreshToken, setRefreshToken, deleteRefreshToken, isWebPlatform } from "@/services/secure-store";
import { normalizeTag } from "@/utils/tag";
import type { RvbAccount, AuthStatus } from "@/types/rvb";
import { RvbApiError } from "@/types/rvb";

interface AuthState {
  status: AuthStatus;
  account: RvbAccount | null;
  accessToken: string | null;
  error: string | null;
  isLoading: boolean;
  isBootstrapped: boolean;

  bootstrap: () => Promise<void>;
  login: (rawTag: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<void>;
  completeOnboarding: (profilePicture: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearSession: () => void;
  setAccount: (account: RvbAccount | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "booting",
  account: null,
  accessToken: null,
  error: null,
  isLoading: false,
  isBootstrapped: false,

  clearSession: () => {
    setAccessTokenMemory(null);
    set({ status: "anonymous", account: null, accessToken: null, error: null, isLoading: false });
  },

  setAccount: (account) => set({ account }),

  bootstrap: async () => {
    set({ status: "booting", error: null, isLoading: true });
    try {
      // PBS-BUG-036: Expo Web bootstraps from the HttpOnly-cookie session.
      // Purge any legacy insecure key first; it is never read back for auth.
      // Native keeps the SecureStore-token gate below. The response handling
      // after the request is shared: web responses carry no JSON refresh
      // token, so conditional persistence is skipped there by construction.
      const web = isWebPlatform();
      if (web) await deleteRefreshToken();
      const refreshToken = web ? null : await getRefreshToken();
      if (!refreshToken && !web) {
        set({ status: "anonymous", account: null, accessToken: null, isLoading: false, isBootstrapped: true });
        return;
      }
      const base = getApiBaseUrl();
      let res: Response;
      try {
        res = await fetch(`${base}/api/rvb/auth/refresh`, {
          method: "POST",
          headers: web
            ? { "Content-Type": "application/json" }
            : { "Content-Type": "application/json", "X-RVB-Client": "native" },
          body: web ? JSON.stringify({}) : JSON.stringify({ refreshToken }),
          ...(web ? { credentials: "include" as RequestCredentials } : {}),
        });
      } catch (e: any) {
        // Network failure: do not delete token
        console.warn("[auth] bootstrap network failure", e?.message);
        set({
          status: "anonymous",
          error: "Network unavailable. Please check connection and retry.",
          isLoading: false,
          isBootstrapped: true,
        });
        return;
      }

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!res.ok || !json?.accessToken) {
        const code = json?.code as string | undefined;
        // Distinguish invalid vs transient
        if (res.status === 401) {
          // Invalid/expired/revoked -> delete
          await deleteRefreshToken();
          setAccessTokenMemory(null);
          set({
            status: "anonymous",
            account: null,
            accessToken: null,
            error: null,
            isLoading: false,
            isBootstrapped: true,
          });
          return;
        }
        if (res.status >= 500) {
          // Server error: keep token
          set({
            status: "anonymous",
            error: "Server unavailable. Please retry.",
            isLoading: false,
            isBootstrapped: true,
          });
          return;
        }
        // Other: delete if terminal
        if (code && ["RVB_TOKEN_INVALID", "RVB_TOKEN_EXPIRED", "RVB_SESSION_REVOKED", "RVB_REFRESH_REQUIRED"].includes(code)) {
          await deleteRefreshToken();
          setAccessTokenMemory(null);
        }
        set({
          status: "anonymous",
          account: null,
          accessToken: null,
          error: json?.message || "Session expired. Please login again.",
          isLoading: false,
          isBootstrapped: true,
        });
        return;
      }

      // Success
      const { accessToken, refreshToken: newRefresh, account } = json;
      setAccessTokenMemory(accessToken);
      if (newRefresh) await setRefreshToken(newRefresh);
      set({
        status: "authenticated",
        account: account as RvbAccount,
        accessToken,
        error: null,
        isLoading: false,
        isBootstrapped: true,
      });

      // Optionally fetch fresh me to ensure mustChangePassword/onboarding sync
      // But refresh already returned account
    } catch (e: any) {
      console.warn("[auth] bootstrap unexpected", e);
      set({ status: "anonymous", error: e?.message || "Bootstrap failed", isLoading: false, isBootstrapped: true });
    }
  },

  login: async (rawTag, password) => {
    const tag = normalizeTag(rawTag);
    if (!tag) throw new RvbApiError({ status: 400, code: "RVB_TAG_REQUIRED", message: "Tag is required" });
    if (!password) throw new RvbApiError({ status: 400, code: "RVB_PASSWORD_REQUIRED", message: "Password is required" });

    set({ isLoading: true, error: null });
    try {
      const base = getApiBaseUrl();
      // PBS-BUG-036: web logs in WITHOUT native identity so the backend mints
      // a cookie (web) session and returns no JSON refresh token. The cookie
      // is stored by the browser (credentials:include); nothing JS-readable
      // is persisted. Native behavior unchanged.
      const web = isWebPlatform();
      const res = await fetch(`${base}/api/rvb/auth/login`, {
        method: "POST",
        headers: web
          ? { "Content-Type": "application/json" }
          : { "Content-Type": "application/json", "X-RVB-Client": "native" },
        body: JSON.stringify(web ? { tag, password } : { tag, password, native: true }),
        ...(web ? { credentials: "include" as RequestCredentials } : {}),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok || !json?.accessToken) {
        const code = json?.code || `HTTP_${res.status}`;
        const message = json?.message || json?.error || text || "Login failed";
        // Do not persist tokens on failure
        set({ isLoading: false, error: message });
        throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
      }
      const { accessToken, refreshToken, account } = json;
      if (refreshToken) await setRefreshToken(refreshToken);
      if (web) await deleteRefreshToken(); // purge legacy insecure key, if any
      setAccessTokenMemory(accessToken);
      set({
        status: "authenticated",
        account: account as RvbAccount,
        accessToken,
        error: null,
        isLoading: false,
        isBootstrapped: true,
      });
    } catch (e: any) {
      if (e instanceof RvbApiError) throw e;
      // network
      const msg = e?.message || "Network error";
      set({ isLoading: false, error: msg });
      throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: msg, raw: e });
    }
  },

  logout: async () => {
    const token = get().accessToken || getAccessTokenMemory();
    const refresh = await getRefreshToken();
    // PBS-BUG-036: web sends the HttpOnly cookie (credentials:include) so the
    // server can revoke the cookie session; getRefreshToken() is null on web.
    const web = isWebPlatform();
    try {
      const base = getApiBaseUrl();
      // Best effort: send both header and body
      await fetch(`${base}/api/rvb/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(refresh ? { "X-Refresh-Token": refresh } : {}),
        },
        body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
        ...(web ? { credentials: "include" as RequestCredentials } : {}),
      });
    } catch (e) {
      console.warn("[auth] logout network error, still clearing locally", e);
    } finally {
      await deleteRefreshToken();
      setAccessTokenMemory(null);
      set({ status: "anonymous", account: null, accessToken: null, error: null, isLoading: false });
      // Disconnect socket
      try {
        const { disconnectSocket } = await import("@/services/socket");
        disconnectSocket();
      } catch {}
    }
  },

  changePassword: async (currentPassword, newPassword, confirmPassword) => {
    const token = get().accessToken || getAccessTokenMemory();
    if (!token) throw new RvbApiError({ status: 401, code: "RVB_UNAUTHENTICATED", message: "Not authenticated" });
    set({ isLoading: true, error: null });
    try {
      const base = getApiBaseUrl();
      // PBS-BUG-036: web includes credentials so the rotated HttpOnly cookie
      // is stored by the browser; the response carries no JSON refresh token
      // for web sessions, so the conditional persistence below is skipped.
      const web = isWebPlatform();
      const res = await fetch(`${base}/api/rvb/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        ...(web ? { credentials: "include" as RequestCredentials } : {}),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const code = json?.code || `HTTP_${res.status}`;
        const message = json?.message || text || "Change password failed";
        set({ isLoading: false, error: message });
        throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
      }
      // Success: may return new tokens
      if (json?.accessToken) {
        setAccessTokenMemory(json.accessToken);
        set({ accessToken: json.accessToken });
      }
      if (json?.refreshToken) {
        await setRefreshToken(json.refreshToken);
      }
      if (json?.account) {
        set({ account: json.account as RvbAccount, isLoading: false, error: null });
      } else {
        // fetch fresh profile
        await get().refreshProfile();
        set({ isLoading: false });
      }
    } catch (e: any) {
      if (e instanceof RvbApiError) throw e;
      set({ isLoading: false, error: e?.message || "Network error" });
      throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: e?.message || "Network error", raw: e });
    }
  },

  completeOnboarding: async (profilePicture) => {
    const token = get().accessToken || getAccessTokenMemory();
    if (!token) throw new RvbApiError({ status: 401, code: "RVB_UNAUTHENTICATED", message: "Not authenticated" });
    if (!profilePicture || !profilePicture.startsWith("data:image/")) {
      throw new RvbApiError({ status: 400, code: "RVB_PROFILE_PICTURE_REQUIRED", message: "Profile picture required" });
    }
    if (profilePicture.length > 250000) {
      throw new RvbApiError({ status: 400, code: "RVB_PROFILE_PICTURE_TOO_LARGE", message: "Image too large" });
    }
    set({ isLoading: true, error: null });
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/rvb/auth/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ profilePicture }),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        const code = json?.code || `HTTP_${res.status}`;
        const message = json?.message || text || "Onboarding failed";
        set({ isLoading: false, error: message });
        throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
      }
      if (json?.account) {
        set({ account: json.account as RvbAccount, isLoading: false, error: null });
      } else {
        await get().refreshProfile();
        set({ isLoading: false });
      }
    } catch (e: any) {
      if (e instanceof RvbApiError) throw e;
      set({ isLoading: false, error: e?.message || "Network error" });
      throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: e?.message || "Network error", raw: e });
    }
  },

  refreshProfile: async () => {
    const token = get().accessToken || getAccessTokenMemory();
    if (!token) return;
    try {
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/rvb/auth/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-RVB-Client": "native",
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (res.ok && json?.account) {
        set({ account: json.account as RvbAccount });
      } else if (res.status === 401) {
        // session revoked etc.
        const code = json?.code || "";
        if (["RVB_SESSION_REVOKED", "RVB_TOKEN_INVALID", "RVB_ACCOUNT_DISABLED", "RVB_ACCOUNT_ARCHIVED"].includes(code)) {
          await deleteRefreshToken();
          setAccessTokenMemory(null);
          set({ status: "anonymous", account: null, accessToken: null });
        }
      }
    } catch (e) {
      console.warn("[auth] refreshProfile failed", e);
    }
  },
}));
