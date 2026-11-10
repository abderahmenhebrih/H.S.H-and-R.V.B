"use client";
import { rvbAuthService } from "./rvb-auth.service";
import { resolveApiBase } from "../lib/api-base";
const API_BASE = resolveApiBase();
const BASE = `${API_BASE}/api/rvb/config`;
function getAuthHeaders(): Record<string, string> { const t = rvbAuthService.getAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function handleRes<T>(res: Response): Promise<T> { const d = await res.json().catch(() => ({})); if (!res.ok) { const e: any = new Error(d?.code || d?.message || `Request failed ${res.status}`); e.code = d?.code; e.status = res.status; e.data = d; throw e; } return d as T; }
export const rvbConfigService = {
  async get(): Promise<{ currency: string; language?: string }> {
    const r = await rvbAuthService.authFetch(BASE, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; config: any }>(r);
    return d.config;
  },
  async update(patch: any): Promise<any> {
    const r = await rvbAuthService.authFetch(BASE, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(patch), credentials: "include" });
    const d = await handleRes<{ success: boolean; config: any }>(r);
    return d.config;
  },
};
