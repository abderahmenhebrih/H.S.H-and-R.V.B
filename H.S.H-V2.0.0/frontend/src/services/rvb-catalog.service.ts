"use client";
import { rvbAuthService } from "./rvb-auth.service";
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
function getAuthHeaders(): Record<string, string> { const t = rvbAuthService.getAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function handleRes<T>(res: Response): Promise<T> { const d = await res.json().catch(() => ({})); if (!res.ok) { const e: any = new Error(d?.code || d?.message || `Request failed ${res.status}`); e.code = d?.code; e.status = res.status; e.data = d; throw e; } return d as T; }
export const rvbCatalogService = {
  async getProductsForCustomer(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${API_BASE}/api/rvb/catalog/products?for=customer`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; products: any[] }>(r);
    return d.products || [];
  },
  async getProductsForSupplier(): Promise<any[]> {
    const r = await rvbAuthService.authFetch(`${API_BASE}/api/rvb/catalog/products?for=supplier`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; products: any[] }>(r);
    return d.products || [];
  },
};
