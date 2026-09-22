"use client";

import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/supplier-requests`;

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

export type SupplierRequest = {
  id: string;
  supplierId: string;
  accountId?: string | null;
  type: "new_supply" | "discrepancy";
  status: "under_review" | "accepted" | "rejected";
  items?: any[] | null;
  total?: number | null;
  description?: string | null;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  notes?: string | null;
  purchaseId?: string | null;
};

export const supplierRequestService = {
  async list(supplierId?: string): Promise<SupplierRequest[]> {
    const url = supplierId ? `${BASE}?supplierId=${encodeURIComponent(supplierId)}` : BASE;
    const res = await fetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; requests: SupplierRequest[] }>(res);
    return data.requests || [];
  },
  async create(input: { supplierId: string; type: "new_supply" | "discrepancy"; items?: any[]; total?: number; calculation?: any; date?: number; description?: string }): Promise<SupplierRequest> {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(input),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; request: SupplierRequest }>(res);
    return data.request;
  },
  async review(id: string, status: "accepted" | "rejected", notes?: string): Promise<SupplierRequest> {
    const res = await fetch(`${BASE}/${encodeURIComponent(id)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ status, notes }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; request: SupplierRequest }>(res);
    return data.request;
  },
};
