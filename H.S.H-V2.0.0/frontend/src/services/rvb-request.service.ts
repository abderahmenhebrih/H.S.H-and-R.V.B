"use client";

import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/requests`;

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

export type NormalizedRequest = {
  id: string;
  source: "worker" | "supplier" | "customer";
  type: string;
  status: "under_review" | "accepted" | "rejected";
  entityId: string;
  accountId?: string | null;
  requesterName: string;
  tag?: string | null;
  amount?: number | null;
  total?: number | null;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  notes?: string | null;
  description?: string | null;
  items?: any[] | null;
  summary: string;
  purchaseId?: string | null;
  paymentId?: string | null;
  saleId?: string | null;
  raw: any;
};

export type RvbRequestsResponse = {
  success: boolean;
  requests: NormalizedRequest[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  kpi: { total: number; underReview: number; accepted: number; rejected: number };
};

export type RvbRequestDetail = {
  id: string;
  source: string;
  type: string;
  status: string;
  entityId: string;
  entity: any;
  account: any;
  reviewer: any;
  submittedAt: number;
  reviewedAt?: number | null;
  reviewedBy?: string | null;
  notes?: string | null;
  description?: string | null;
  amount?: number | null;
  total?: number | null;
  items: any[];
  calculation?: any;
  date?: number | null;
  purchaseId?: string | null;
  paymentId?: string | null;
  saleId?: string | null;
  originalItems?: any[] | null;
  originalTotal?: number | null;
  raw: any;
};

export const rvbRequestService = {
  async list(params: { status?: string; source?: string; type?: string; search?: string; page?: number; limit?: number } = {}): Promise<RvbRequestsResponse> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.source) qs.set("source", params.source);
    if (params.type) qs.set("type", params.type);
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const url = qs.toString() ? `${BASE}?${qs.toString()}` : BASE;
    const res = await rvbAuthService.authFetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<RvbRequestsResponse>(res);
    return data;
  },
  async getDetail(source: string, id: string): Promise<RvbRequestDetail> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(source)}/${encodeURIComponent(id)}`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; request: RvbRequestDetail }>(res);
    return data.request;
  },
  async review(source: string, id: string, status: "accepted" | "rejected", notes?: string, edited?: { items?: any[]; total?: number; calculation?: any; date?: number }): Promise<any> {
    const res = await rvbAuthService.authFetch(`${BASE}/${encodeURIComponent(source)}/${encodeURIComponent(id)}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ status, notes, ...edited }),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; request: any }>(res);
    return data.request;
  },
};
