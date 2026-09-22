"use client";
import { rvbAuthService } from "./rvb-auth.service";
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/suppliers`;
function getAuthHeaders(): Record<string, string> { const t = rvbAuthService.getAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function handleRes<T>(res: Response): Promise<T> { const d = await res.json().catch(() => ({})); if (!res.ok) { const e: any = new Error(d?.code || d?.message || `Request failed ${res.status}`); e.code = d?.code; e.status = res.status; e.data = d; throw e; } return d as T; }
export const rvbSupplierService = {
  async list(): Promise<any[]> {
    const r = await fetch(BASE, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; suppliers: any[] }>(r);
    return d.suppliers || [];
  },
  async get(id: string): Promise<any> {
    const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; supplier: any }>(r);
    return d.supplier;
  },
  async create(payload: any): Promise<any> {
    const r = await fetch(BASE, { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(payload), credentials: "include" });
    const d = await handleRes<{ success: boolean; supplier: any }>(r);
    return d.supplier;
  },
  async update(id: string, payload: any): Promise<any> {
    const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() }, body: JSON.stringify(payload), credentials: "include" });
    const d = await handleRes<{ success: boolean; supplier: any }>(r);
    return d.supplier;
  },
  async delete(id: string): Promise<any> {
    const r = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE", headers: { ...getAuthHeaders() }, credentials: "include" });
    return handleRes(r);
  },
  async getPurchases(id: string): Promise<any[]> {
    const r = await fetch(`${BASE}/${encodeURIComponent(id)}/purchases`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; purchases: any[] }>(r);
    return d.purchases || [];
  },
  async getPayments(id: string): Promise<any[]> {
    const r = await fetch(`${BASE}/${encodeURIComponent(id)}/payments`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; payments: any[] }>(r);
    return d.payments || [];
  },
};
