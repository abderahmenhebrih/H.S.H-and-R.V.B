"use client";

import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/customer-requests`;

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

export type CustomerRequest = {
  id: string;
  customerId: string;
  accountId?: string | null;
  type: "insert_shipment" | "discrepancy";
  status: "under_review" | "accepted" | "rejected";
  items?: any[] | null;
  total?: number | null;
  date?: number | null;
  description?: string | null;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  notes?: string | null;
  saleId?: string | null;
  originalItems?: any[] | null;
  originalTotal?: number | null;
};

export const customerRequestService = {
  async list(customerId?: string): Promise<CustomerRequest[]> {
    const url = customerId ? `${BASE}?customerId=${encodeURIComponent(customerId)}` : BASE;
    const res = await fetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; requests: CustomerRequest[] }>(res);
    return data.requests || [];
  },
  async create(input: { customerId: string; type: "insert_shipment" | "discrepancy"; items?: any[]; total?: number; date?: number; description?: string }): Promise<CustomerRequest> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(input),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; request: CustomerRequest }>(res);
    return data.request;
  },
  async review(id: string, status: "accepted" | "rejected", notes?: string, edited?: { items?: any[]; total?: number; date?: number }): Promise<CustomerRequest> {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ status, notes, ...edited }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; request: CustomerRequest }>(res);
    return data.request;
  },
};
