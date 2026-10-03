import { io, Socket } from "socket.io-client";
import { getSocketUrl, getSocketPath } from "@/api/config";
import { getAccessTokenMemory } from "@/api/client";

let socket: Socket | null = null;
let currentToken: string | null = null;

export function getSocket(): Socket | null {
  return socket;
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
    transports: ["websocket", "polling"],
    autoConnect: true,
  });

  currentToken = t;

  socket.on("connect", () => {
    console.log("[socket] connected", socket?.id);
  });
  socket.on("disconnect", (reason) => {
    console.log("[socket] disconnect", reason);
  });
  socket.on("connect_error", (err: any) => {
    console.warn("[socket] connect_error", err?.message);
    // If session revoked, clear auth
    const msg = err?.message || "";
    if (msg.includes("RVB_SESSION_REVOKED") || msg.includes("RVB_UNAUTHENTICATED") || msg.includes("RVB_TOKEN")) {
      // Let auth store handle? We can trigger clear
      disconnectSocket();
    }
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
