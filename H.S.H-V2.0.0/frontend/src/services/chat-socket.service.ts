"use client";

import { io, Socket } from "socket.io-client";
import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
let socket: Socket | null = null;
let listenersBound = false;

// PBS-BUG-035: bounded single-flight socket auth recovery.
// A stale socket token is NOT proof the user session died: an HTTP refresh may
// already have rotated S1 -> S2 (storing A2 in memory) while this socket still
// carries A1, or one shared refresh may repair it. Terminal account/session
// states stop recovery; durable auth cleanup stays owned by the HTTP layer
// (PBS-BUG-030) — this service never destroys local auth state.
let recoveryPromise: Promise<boolean> | null = null;
let failedRecoveryKey: string | null = null;

function socketErrorCode(err: unknown): string {
  // Backend socket middleware rejects with `next(new Error(CODE))`, which the
  // client surfaces as message-only (err.data/err.code are undefined today).
  // Prefer structured codes when present; fall back to the message text.
  const e = err as { data?: { code?: unknown }; code?: unknown; message?: unknown } | null | undefined;
  const structured = e?.data?.code ?? e?.code;
  if (typeof structured === "string" && structured) return structured;
  return typeof e?.message === "string" ? e.message : "";
}

function matchesSocketCode(err: unknown, code: string): boolean {
  return socketErrorCode(err).includes(code);
}

function getSocketToken(sock: Socket): string | null {
  const a = (sock as unknown as { auth?: { token?: unknown } }).auth;
  return typeof a?.token === "string" ? a.token : null;
}

function setSocketToken(sock: Socket, token: string) {
  const s = sock as unknown as { auth?: Record<string, unknown> };
  const prev = (typeof s.auth === "object" && s.auth !== null ? s.auth : {}) as Record<string, unknown>;
  s.auth = { ...prev, token };
  try { sock.connect(); } catch {}
}

async function recoverSocketAuth(): Promise<boolean> {
  const sock = socket;
  if (!sock) return false;
  // C1 fast path: reuse an already-newer in-memory token instead of rotating again.
  const current = rvbAuthService.getAccessToken();
  const sockToken = getSocketToken(sock);
  if (current && current !== sockToken) {
    failedRecoveryKey = null;
    setSocketToken(sock, current);
    return true;
  }
  // Identical stale state already failed once -> stop instead of looping.
  const key = `${current ?? ""}||${sockToken ?? ""}`;
  if (failedRecoveryKey !== null && failedRecoveryKey === key) return false;
  // Let an in-flight HTTP refresh land first so the fast path can reuse it
  // instead of forcing a redundant S2 -> S3 rotation.
  await new Promise((r) => setTimeout(r, 400));
  if (socket !== sock) return false;
  const current2 = rvbAuthService.getAccessToken();
  const sockToken2 = getSocketToken(sock);
  if (current2 && current2 !== sockToken2) {
    failedRecoveryKey = null;
    setSocketToken(sock, current2);
    return true;
  }
  // C2 fallback: one shared refresh via the existing 028 path (never private).
  try {
    const refresher = rvbAuthService as unknown as { refresh: () => Promise<{ accessToken?: unknown }> };
    const refreshed = await refresher.refresh();
    if (socket !== sock) return false;
    if (typeof refreshed?.accessToken === "string") {
      failedRecoveryKey = null;
      setSocketToken(sock, refreshed.accessToken);
      return true;
    }
  } catch {}
  failedRecoveryKey = key;
  return false;
}

function recoverSocketAuthOnce(): Promise<boolean> {
  if (!recoveryPromise) {
    recoveryPromise = recoverSocketAuth().finally(() => { recoveryPromise = null; });
  }
  return recoveryPromise;
}

function haltSocketRecovery(soc: Socket | null) {
  // Terminal state: ensure no futile re-handshakes remain queued.
  try { soc?.disconnect(); } catch {}
}

export function getChatSocket(): Socket | null {
  return socket;
}

export function connectChatSocket(): Socket | null {
  const token = rvbAuthService.getAccessToken();
  if (!token) return null;
  if (socket && socket.connected) return socket;
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
  // PBS-BUG-035-REVISION: a deliberately created Socket starts a NEW
  // user-visible connection episode (fresh mount, navigation, explicit retry).
  // A previous episode's transient failure (500/network) must not poison it:
  // reset the same-state loop guard so this episode gets ONE fresh attempt.
  // Same-instance repeats stay bounded by failedRecoveryKey (manager emits no
  // auto-retry for middleware rejections; identical manual repeats stop).
  failedRecoveryKey = null;
  socket = io(API_BASE, {
    path: "/api/rvb/chats/socket",
    auth: { token },
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
  });
  // PBS-BUG-035: socket auth recovery (same instance, so page listeners survive).
  socket.on("connect_error", async (err: unknown) => {
    const target = socket;
    if (!target) return;
    if (matchesSocketCode(err, "RVB_ACCOUNT_ARCHIVED") || matchesSocketCode(err, "RVB_ACCOUNT_DISABLED")) {
      // Terminal account state: never refresh (rule: no repeated refresh for
      // archived/disabled); halt and let the HTTP layer fail closed (030).
      haltSocketRecovery(target);
      return;
    }
    if (
      matchesSocketCode(err, "RVB_TOKEN_INVALID") ||
      matchesSocketCode(err, "RVB_UNAUTHENTICATED") ||
      matchesSocketCode(err, "RVB_SESSION_REVOKED")
    ) {
      // Recoverable-or-superseded session: reuse a newer memory token when one
      // exists, else one shared refresh; terminal refresh failure stops closed.
      const ok = await recoverSocketAuthOnce();
      if (!ok) haltSocketRecovery(socket);
      return;
    }
    // Unknown errors: keep default Socket.IO behavior (no interference).
  });
  socket.on("disconnect", (reason: string) => {
    // Session rotation (safeDisconnectSession) reaches the client as
    // "io server disconnect" with NO automatic reconnect and NO connect_error.
    // Recover on this same instance. Explicit local disconnects
    // ("io client disconnect") and transport loss keep default behavior:
    // logout must not resurrect, network drops use normal Socket.IO backoff.
    if (reason === "io server disconnect") {
      void recoverSocketAuthOnce().then((ok) => { if (!ok) haltSocketRecovery(socket); });
    }
  });
  return socket;
}

export function disconnectChatSocket() {
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
}
