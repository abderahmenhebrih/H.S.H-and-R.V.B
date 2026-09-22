"use client";

import { io, Socket } from "socket.io-client";
import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
let socket: Socket | null = null;
let listenersBound = false;

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
  socket = io(API_BASE, {
    path: "/api/rvb/chats/socket",
    auth: { token },
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 800,
  });
  // Re-auth on reconnect: refresh token if needed
  (socket as any).on("connect_error", async (err: any) => {
    const msg = err?.message || "";
    if (msg.includes("RVB_TOKEN_INVALID") || msg.includes("RVB_UNAUTHENTICATED")) {
      try {
        const refreshed: any = await (rvbAuthService as any).refresh();
        if (refreshed?.accessToken) {
          (socket as any).auth = { token: refreshed.accessToken };
          (socket as Socket).connect();
        }
      } catch {}
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
