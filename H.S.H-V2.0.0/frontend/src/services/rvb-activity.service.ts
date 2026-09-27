"use client";
import { rvbAuthService } from "./rvb-auth.service";
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/activities`;
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
export const rvbActivityService = {
  async list(params: { source?: string; search?: string; date?: string; actor?: string; page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams();
    if (params.source) qs.set("source", params.source);
    if (params.search) qs.set("search", params.search);
    if (params.date) qs.set("date", params.date);
    if (params.actor) qs.set("actor", params.actor);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const url = qs.toString() ? `${BASE}?${qs.toString()}` : BASE;
    const res = await rvbAuthService.authFetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    return handleRes<{ success: boolean; activities: any[]; total: number; page: number; limit: number; totalPages: number }>(res);
  },
};
