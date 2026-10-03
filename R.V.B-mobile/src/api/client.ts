import { getApiBaseUrl } from "@/api/config";
import { RvbApiError } from "@/types/rvb";
import { getRefreshToken, setRefreshToken, deleteRefreshToken, isWebPlatform } from "@/services/secure-store";

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  skipRefresh?: boolean;
  timeoutMs?: number;
}

let pendingRefreshPromise: Promise<boolean> | null = null;
let accessTokenMemory: string | null = null;

// Allow auth store to inject memory token getters/setters without circular import at init
export function setAccessTokenMemory(token: string | null) {
  accessTokenMemory = token;
}

export function getAccessTokenMemory(): string | null {
  return accessTokenMemory;
}

function isTerminalAuthCode(code: string): boolean {
  return ["RVB_SESSION_REVOKED", "RVB_ACCOUNT_DISABLED", "RVB_ACCOUNT_ARCHIVED", "RVB_TOKEN_INVALID", "RVB_TOKEN_EXPIRED"].includes(code);
}

async function performRefresh(): Promise<boolean> {
  // PBS-BUG-036: Expo Web refreshes through the HttpOnly-cookie session
  // (credentials:include, no JSON token, no native identity). Native keeps
  // the SecureStore refresh-token protocol. Response handling below is
  // shared: web responses simply carry no JSON refreshToken, so the
  // conditional persistence is skipped there by construction.
  const web = isWebPlatform();
  const refreshToken = web ? null : await getRefreshToken();
  if (!refreshToken && !web) return false;
  try {
    const base = getApiBaseUrl();
    const res = await fetch(`${base}/api/rvb/auth/refresh`, {
      method: "POST",
      headers: web
        ? { "Content-Type": "application/json" }
        : { "Content-Type": "application/json", "X-RVB-Client": "native" },
      body: web ? JSON.stringify({}) : JSON.stringify({ refreshToken }),
      ...(web ? { credentials: "include" as RequestCredentials } : {}),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok || !json || !json.accessToken) {
      // Invalid/expired -> clear
      const code = json?.code as string | undefined;
      // Network error vs invalid? Will be handled by caller distinguishing.
      // For now, if we got JSON with error code, treat as terminal invalid.
      if (res.status === 401) {
        await deleteRefreshToken();
        setAccessTokenMemory(null);
        return false;
      }
      // Other errors: don't delete token on transient server error
      if (res.status >= 500) {
        return false;
      }
      // Default: delete on 401 invalid
      if (code && isTerminalAuthCode(code)) {
        await deleteRefreshToken();
        setAccessTokenMemory(null);
      }
      return false;
    }
    // Success
    setAccessTokenMemory(json.accessToken);
    if (json.refreshToken) {
      await setRefreshToken(json.refreshToken);
    }
    // Optionally update stored account? Auth store will handle via bootstrap/refresh caller.
    // We need to notify auth store: but we can update a global listener
    // For now, store will be updated via imported setter if needed.
    // Notify via custom event? Instead, try to update Zustand if available.
    try {
      const { useAuthStore } = await import("@/stores/auth-store");
      const state = useAuthStore.getState();
      if (json.account) {
        useAuthStore.setState({ account: json.account, accessToken: json.accessToken, status: "authenticated", error: null });
      } else {
        useAuthStore.setState({ accessToken: json.accessToken });
      }
    } catch {}
    return true;
  } catch (e: any) {
    // Network failure: do NOT delete token
    console.warn("[api] refresh network failure", e?.message || e);
    return false;
  }
}

function getPendingRefresh(): Promise<boolean> {
  if (pendingRefreshPromise) return pendingRefreshPromise;
  pendingRefreshPromise = performRefresh().finally(() => {
    pendingRefreshPromise = null;
  });
  return pendingRefreshPromise;
}

export async function rvbRequest<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const method = options.method || "GET";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-RVB-Client": "native",
    ...options.headers,
  };

  if (!options.skipAuth && accessTokenMemory) {
    headers["Authorization"] = `Bearer ${accessTokenMemory}`;
  }

  let bodyStr: string | undefined;
  if (options.body !== undefined) {
    bodyStr = JSON.stringify(options.body);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: bodyStr,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === "AbortError") {
      throw new RvbApiError({ status: 0, code: "TIMEOUT", message: "Request timed out" });
    }
    throw new RvbApiError({ status: 0, code: "NETWORK_ERROR", message: "Network error. Check connection and EXPO_PUBLIC_RVB_API_URL", raw: e });
  }
  clearTimeout(timeout);

  // Try parse
  const text = await res.text();
  let json: any = null;
  let isJson = false;
  if (text) {
    try {
      json = JSON.parse(text);
      isJson = true;
    } catch {
      isJson = false;
    }
  }

  if (!res.ok) {
    // Handle 401 with refresh dedupe (once)
    if (res.status === 401 && !options.skipRefresh && !options.skipAuth) {
      const code = (isJson && json?.code) || "";
      // Terminal codes that should not loop refresh? But we still attempt refresh once.
      // If refresh succeeds, retry once.
      // Prevent loops: if this was already a retry with skipRefresh, don't.
      const refreshed = await getPendingRefresh();
      if (refreshed && getAccessTokenMemory()) {
        // retry once with new token, skipRefresh to avoid loop
        return rvbRequest<T>(path, { ...options, skipRefresh: true });
      }
      // Refresh failed -> throw terminal error
      // For revoked session, ensure local clear
      if (code === "RVB_SESSION_REVOKED" || code === "RVB_TOKEN_INVALID" || code === "RVB_TOKEN_EXPIRED" || code === "RVB_REFRESH_REQUIRED") {
        // Clear local session to force re-login
        await deleteRefreshToken();
        setAccessTokenMemory(null);
        try {
          const { useAuthStore } = await import("@/stores/auth-store");
          useAuthStore.getState().clearSession();
        } catch {}
      }
      // Normalize error
      const message = (isJson && (json?.message || json?.error)) || `Unauthorized (${code || res.status})`;
      throw new RvbApiError({ status: res.status, code: code || "RVB_UNAUTHENTICATED", message, data: json, raw: text });
    }

    const code = (isJson && json?.code) || `HTTP_${res.status}`;
    const message = (isJson && (json?.message || json?.error || json?.msg)) || text || `Request failed (${res.status})`;
    // Also handle global revocation codes even not 401? Some backends return 403 for disabled
    if (isTerminalAuthCode(code)) {
      await deleteRefreshToken();
      setAccessTokenMemory(null);
      try {
        const { useAuthStore } = await import("@/stores/auth-store");
        useAuthStore.getState().clearSession();
      } catch {}
    }
    throw new RvbApiError({ status: res.status, code, message, data: json, raw: text });
  }

  if (!isJson) {
    // Non-JSON success? Return text
    return text as unknown as T;
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "PATCH", body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "PUT", body }),
  del: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) => rvbRequest<T>(path, { ...opts, method: "DELETE" }),
};

// For testing: allow injecting mock refresh behavior
export const _internal = {
  getPendingRefresh,
  performRefresh,
  setAccessTokenMemory,
};
