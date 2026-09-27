"use client";

import { rvbAuthService } from "./rvb-auth.service";

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";
const BASE = `${API_BASE}/api/rvb/worker-activities`;

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

export type WorkerActivity = {
  id: string;
  workerId: string;
  accountId?: string | null;
  action: string;
  details?: string | null;
  actorId?: string | null;
  actorTag?: string | null;
  createdAt: number;
};

export const workerActivityService = {
  async list(workerId?: string): Promise<WorkerActivity[]> {
    const url = workerId ? `${BASE}?workerId=${encodeURIComponent(workerId)}` : BASE;
    const res = await rvbAuthService.authFetch(url, { cache: "no-store", headers: { ...getAuthHeaders() }, credentials: "include" });
    const data = await handleResponse<{ success: boolean; activities: WorkerActivity[] }>(res);
    return data.activities || [];
  },
};
