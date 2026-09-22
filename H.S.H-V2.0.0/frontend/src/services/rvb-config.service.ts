"use client";
import { rvbAuthService } from "./rvb-auth.service";
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/config`;
function getAuthHeaders(): Record<string, string> { const t = rvbAuthService.getAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function handleRes<T>(res: Response): Promise<T> { const d = await res.json().catch(() => ({})); if (!res.ok) { const e: any = new Error(d?.code || d?.message || `Request failed ${res.status}`); e.code = d?.code; e.status = res.status; e.data = d; throw e; } return d as T; }
export const rvbConfigService = {
  async get(): Promise<{ currency: string; language?: string }> {
    const r = await fetch(BASE, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; config: any }>(r);
    return d.config;
  },
  async update(patch: any): Promise<any> {
    const r = await fetch(BASE, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(patch), credentials: "include" });
    const d = await handleRes<{ success: boolean; config: any }>(r);
    return d.config;
  },
};
