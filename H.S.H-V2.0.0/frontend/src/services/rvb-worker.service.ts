"use client";
import { rvbAuthService } from "./rvb-auth.service";
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/workers`;
function getAuthHeaders(): Record<string, string> { const t = rvbAuthService.getAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function handleRes<T>(res: Response): Promise<T> { const d = await res.json().catch(() => ({})); if (!res.ok) { const e: any = new Error(d?.code || d?.message || `Request failed ${res.status}`); e.code = d?.code; e.status = res.status; e.data = d; throw e; } return d as T; }
export const rvbWorkerService = {
  async list(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(BASE, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; workers: any[] }>(r);
    return d.workers || [];
  },
  async get(id: string): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; worker: any }>(r);
    return d.worker;
  },
  async create(payload: any): Promise<any> {
    const r = await rvbAuthService.authFetch(BASE, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(payload), credentials: "include" });
    const d = await handleRes<{ success: boolean; worker: any }>(r);
    return d.worker;
  },
  async update(id: string, payload: any): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(payload), credentials: "include" });
    const d = await handleRes<{ success: boolean; worker: any }>(r);
    return d.worker;
  },
  async archive(id: string): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}/archive`, { method: "POST", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; worker: any }>(r);
    return d.worker;
  },
  async reactivate(id: string): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}/reactivate`, { method: "POST", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; worker: any }>(r);
    return d.worker;
  },
  async getFinancialEvents(id: string): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}/financial-events`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; events: any[] }>(r);
    return d.events || [];
  },
  async getActivities(id: string): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}/activities`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; activities: any[] }>(r);
    return d.activities || [];
  },
  async bonusAbsence(id: string, payload: { type: "bonus" | "absence"; amount: number; note?: string }): Promise<any> {
    const r = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}/bonus-absence`, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(payload), credentials: "include" });
    const d = await handleRes<{ success: boolean; worker: any; event: any }>(r);
    return d;
  },
};
