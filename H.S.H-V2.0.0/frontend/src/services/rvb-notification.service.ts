"use client";
import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/notifications`;

function getAuthHeaders(): Record<string, string> {
  const token = rvbAuthService.getAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}
async function handleRes<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e: any = new Error(data?.code || data?.message || `Request failed ${res.status}`);
    e.code = data?.code;
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data as T;
}

export const rvbNotificationService = {
  async list(params: { status?: string; source?: string; priority?: string; date?: string; search?: string; page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.source) qs.set("source", params.source);
    if (params.priority) qs.set("priority", params.priority);
    if (params.date) qs.set("date", params.date);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const url = qs.toString() ? `${BASE}?${qs.toString()}` : BASE;
    const res = await fetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    return handleRes<{ success: boolean; notifications: any[]; total: number; page: number; limit: number; totalPages: number; unreadCount: number; archivedCount: number }>(res);
  },
  async count() {
    const res = await fetch(`${BASE}/count`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    return handleRes<{ success: boolean; unreadCount: number; archivedCount: number }>(res);
  },
  async markRead(id: string, unread = false) {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ unread }),
      credentials: "include",
    });
    return handleRes<any>(res);
  },
  async archive(id: string, archived = true) {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ archived }),
      credentials: "include",
    });
    return handleRes<any>(res);
  },
  async restore(id: string) {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      credentials: "include",
    });
    return handleRes<any>(res);
  },
  async markAllRead() {
    const res = await fetch(`${BASE}/mark-all-read`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      credentials: "include",
    });
    return handleRes<any>(res);
  },
  async bulk(ids: string[], action: "read" | "unread" | "archive" | "restore") {
    const res = await fetch(`${BASE}/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ ids, action }),
      credentials: "include",
    });
    return handleRes<any>(res);
  },
};
