"use client";

import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/worker-financial-events`;

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

export type WorkerFinancialEvent = {
  id: string;
  workerId: string;
  type: "salary" | "bonus" | "absence" | "payment" | "loan" | "adjustment";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note?: string | null;
  actorId?: string | null;
  actorTag?: string | null;
  createdAt: number;
};

export const workerFinancialEventService = {
  async list(workerId: string): Promise<WorkerFinancialEvent[]> {
    const res = await rvbAuthService.authFetch(`${BASE}?workerId=${encodeURIComponent(workerId)}`, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; events: WorkerFinancialEvent[] }>(res);
    return data.events || [];
  },
  async create(input: { workerId: string; type: "bonus" | "absence" | "salary" | "loan" | "adjustment"; amount: number; note?: string }): Promise<any> {
    const res = await rvbAuthService.authFetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(input),
      credentials: "include",
    });
    const data = await handleResponse<{ success: boolean; event: any; worker?: any }>(res);
    return data as any;
  },
};
