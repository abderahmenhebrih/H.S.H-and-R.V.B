"use client";

import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/customer-orders`;

function getAuthHeaders(): Record<string, string> {
  const token = rvbAuthService.getAccessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}
async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data?.code || data?.message || `Request failed ${res.status}`);
    err.code = data?.code;
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export type CustomerOrder = {
  id: string;
  customerId: string;
  accountId?: string | null;
  status: "under_review" | "accepted" | "rejected" | "cancelled";
  items: { productId: string; quantity: number; weightKg: number; price: number; total: number }[];
  total: number;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  cancelledAt?: number | null;
  notes?: string | null;
};

export const customerOrderService = {
  async list(filter?: { customerId?: string; status?: string }): Promise<CustomerOrder[]> {
    const params = new URLSearchParams();
    if (filter?.customerId) params.set("customerId", filter.customerId);
    if (filter?.status) params.set("status", filter.status);
    const url = params.toString() ? `${BASE}?${params.toString()}` : BASE;
    const res = await rvbAuthService.authFetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; orders: CustomerOrder[] }>(res);
    return data.orders || [];
  },
  async create(input: { customerId?: string; items: any[]; total: number; notes?: string }, opts?: { idempotencyKey?: string }): Promise<CustomerOrder> {
    // Stable key per attempt; per-call fallback. Same contract as mobile:
    // retries reuse the key, new intentional orders use a new key.
    const key =
      opts?.idempotencyKey ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ord_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffffffff).toString(16)}`);
    const res = await rvbAuthService.authFetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders(), "Idempotency-Key": key },
      body: JSON.stringify(input),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; order: CustomerOrder }>(res);
    return data.order;
  },
  async review(id: string, status: "accepted" | "rejected", items?: any[], notes?: string): Promise<CustomerOrder> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ status, items, notes }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; order: CustomerOrder }>(res);
    return data.order;
  },
  async cancel(id: string): Promise<CustomerOrder> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      headers: { ...getAuthHeaders() },
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; order: CustomerOrder }>(res);
    return data.order;
  },
  async edit(id: string, items: any[], notes?: string): Promise<CustomerOrder> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ items, notes }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; order: CustomerOrder }>(res);
    return data.order;
  },
};
