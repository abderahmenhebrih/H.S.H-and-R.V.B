import { io, Socket } from "socket.io-client";
import { getSocketUrl, getSocketPath } from "@/api/config";
import { getAccessTokenMemory, _internal } from "@/api/client";

let socket: Socket | null = null;
let currentToken: string | null = null;
let reconnectAttempts = 0;
let recovering = false;

export function getSocket(): Socket | null {
  return socket;
}

// Sanitized diagnostics for on-device proof (NO tokens/cookies/secrets).
export function getSocketDiagnostics(): {
  url: string;
  path: string;
  transport: string;
  connected: boolean;
  attempts: number;
  hasToken: boolean;
} {
  let url = "unknown";
  try {
    url = getSocketUrl();
  } catch {}
  let transport = "unknown";
  try {
    transport = (socket as any)?.io?.engine?.transport?.name || transport;
  } catch {}
  return {
    url,
    path: getSocketPath(),
    transport,
    connected: !!socket?.connected,
    attempts: reconnectAttempts,
    hasToken: !!getAccessTokenMemory(),
  };
}

function diagLine(err: any): string {
  const d = getSocketDiagnostics();
  const detail =
    typeof err?.description === "string" && err.description ? ` desc=${err.description.slice(0, 80)}` : "";
  return `url=${d.url} transport=${d.transport} connected=${d.connected} attempts=${d.attempts} err=${String(err?.message || err).slice(0, 120)}${detail}`;
}

function isAuthRejection(msg: string): boolean {
  return (
    msg.includes("RVB_SESSION_REVOKED") ||
    msg.includes("RVB_UNAUTHENTICATED") ||
    msg.includes("RVB_TOKEN_INVALID") ||
    msg.includes("RVB_TOKEN_EXPIRED") ||
    msg.includes("RVB_TOKEN") ||
    msg.includes("RVB_ACCOUNT_DISABLED") ||
    msg.includes("RVB_ACCOUNT_ARCHIVED")
  );
}

// Auth rejection (server middleware RVB_* error) recovery: the access
// token may simply have rotated. Attempt ONE deduped refresh, then reconnect
// with the fresh token. If refresh fails the session is truly dead — drop the
// socket and let the normal 401 flow force re-login. Never loops: `recovering`
// guards re-entry and refresh itself is deduped inside the api layer.
async function recoverFromAuthRejection(): Promise<void> {
  if (recovering) return;
  recovering = true;
  try {
    const ok = await _internal.getPendingRefresh();
    if (ok && getAccessTokenMemory()) {
      if (!getSocket()?.connected) connectSocket();
    } else {
      disconnectSocket();
    }
  } catch {
    disconnectSocket();
  } finally {
    recovering = false;
  }
}

export function connectSocket(token?: string) {
  const t = token || getAccessTokenMemory();
  if (!t) {
    console.warn("[socket] no token, cannot connect");
    return null;
  }
  // If already connected with same token, reuse
  if (socket && currentToken === t && socket.connected) return socket;

  // Disconnect old if token changed
  if (socket) {
    try {
      socket.disconnect();
    } catch {}
    socket = null;
  }

  const url = getSocketUrl();
  const path = getSocketPath();

  socket = io(url, {
    path,
    auth: { token: t },
    // Library-default order: polling handshake, then upgrade to websocket.
    // Robust through proxies/cold starts (Render); direct-websocket-first
    // caused avoidable "websocket error" noise with zero benefit.
    transports: ["polling", "websocket"],
    // Bounded backoff: ~1s growing to 15s cap with jitter. Attempts are
    // uncapped by design (chat must self-heal), but the delay is bounded so
    // a dead backend never causes a rapid reconnect loop.
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15000,
    randomizationFactor: 0.5,
    timeout: 20000,
    autoConnect: true,
  });

  currentToken = t;

  socket.on("connect", () => {
    reconnectAttempts = 0;
    console.log("[socket] connected", socket?.id);
  });
  socket.on("disconnect", (reason) => {
    console.log("[socket] disconnect", reason);
  });
  try {
    const mgr: any = (socket as any)?.io;
    mgr?.on?.("reconnect_attempt", (n: number) => {
      reconnectAttempts = typeof n === "number" ? n : reconnectAttempts + 1;
    });
    mgr?.on?.("reconnect", () => {
      reconnectAttempts = 0;
    });
  } catch {}
  socket.on("connect_error", (err: any) => {
    const msg = String(err?.message || "");
    if (isAuthRejection(msg)) {
      // Server explicitly rejected the session: observable warning + recovery.
      console.warn("[socket] auth rejected:", msg.slice(0, 120));
      disconnectSocket();
      void recoverFromAuthRejection();
      return;
    }
    // Transport/network failure ("websocket error", timeouts, unreachable):
    // expected transiently (cold start, WiFi blip). Downgraded to info so
    // routine reconnects don't spam LogBox; details stay observable here.
    reconnectAttempts += 1;
    console.log(`[socket] transient connect issue (${diagLine(err)})`);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    try {
      socket.disconnect();
    } catch {}
    socket = null;
    currentToken = null;
  }
}

export function isSocketConnected(): boolean {
  return !!socket?.connected;
}
