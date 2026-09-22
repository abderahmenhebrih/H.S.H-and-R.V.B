"use client";
import { rvbAuthService } from "./rvb-auth.service";
const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/portal`;
function getAuthHeaders(): Record<string, string> { const t = rvbAuthService.getAccessToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }
async function handleRes<T>(res: Response): Promise<T> { const d = await res.json().catch(() => ({})); if (!res.ok) { const e: any = new Error(d?.code || d?.message || `Request failed ${res.status}`); e.code = d?.code; e.status = res.status; e.data = d; throw e; } return d as T; }
export const rvbPortalService = {
  async me(): Promise<any> {
    const r = await fetch(`${BASE}/me`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; account: any; entity: any; entityType: string }>(r);
    return d;
  },
  async getWorker(): Promise<any> {
    const r = await fetch(`${BASE}/worker`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; worker: any }>(r);
    return d.worker;
  },
  async getWorkerFinancial(): Promise<any[]> {
    const r = await fetch(`${BASE}/worker/financial`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; events: any[] }>(r);
    return d.events || [];
  },
  async getWorkerActivities(): Promise<any[]> {
    const r = await fetch(`${BASE}/worker/activities`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; activities: any[] }>(r);
    return d.activities || [];
  },
  async getSupplier(): Promise<any> {
    const r = await fetch(`${BASE}/supplier`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; supplier: any }>(r);
    return d.supplier;
  },
  async getSupplierPurchases(): Promise<any[]> {
    const r = await fetch(`${BASE}/supplier/purchases`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; purchases: any[] }>(r);
    return d.purchases || [];
  },
  async getSupplierPayments(): Promise<any[]> {
    const r = await fetch(`${BASE}/supplier/payments`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; payments: any[] }>(r);
    return d.payments || [];
  },
  async getCustomer(): Promise<any> {
    const r = await fetch(`${BASE}/customer`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; customer: any }>(r);
    return d.customer;
  },
  async getCustomerSales(): Promise<any[]> {
    const r = await fetch(`${BASE}/customer/sales`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; sales: any[] }>(r);
    return d.sales || [];
  },
  async getCustomerPayments(): Promise<any[]> {
    const r = await fetch(`${BASE}/customer/payments`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; payments: any[] }>(r);
    return d.payments || [];
  },
  async getCustomerOrders(): Promise<any[]> {
    const r = await fetch(`${BASE}/customer/orders`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const d = await handleRes<{ success: boolean; orders: any[] }>(r);
    return d.orders || [];
  },
};
